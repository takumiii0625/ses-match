import { prisma } from "@/lib/prisma";
import { sendMail, buildProjectEmail, transformProjectBody } from "@/lib/email/send";
import { getAI } from "@/lib/ai";
import { mapLimit } from "@/lib/limit";

/** From ヘッダ等から素のメールアドレスを取り出す。 */
export function parseEmailAddr(s?: string | null): string | null {
  if (!s) return null;
  const m = s.match(/<([^>]+)>/) ?? s.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1].toLowerCase() : null;
}

export interface PreparedProjectMail {
  to: string;
  subject: string;
  text: string;
  lastSentAt: Date | null; // この人材×案件に過去送信した最新日時（未送信なら null）
}

export type PrepareResult =
  | { ok: true; mail: PreparedProjectMail }
  | { ok: false; status: number; error: string };

/**
 * 案件本文の整形ブロックを得る。LLM 整形を試し、失敗時は決め打ち整形にフォールバック。
 * 整形結果は案件にのみ依存する（人材に依存しない）のでキャッシュ可能。
 */
async function formatProjectBlock(
  raw: string,
  projectEmailPrompt: string | null | undefined,
): Promise<string> {
  let block = "";
  try {
    block = (await getAI().formatProjectBody(raw, projectEmailPrompt ?? undefined)).trim();
  } catch {
    /* フォールバックへ */
  }
  if (!block) block = transformProjectBody(raw);
  return block;
}

/**
 * マッチ確定後に呼ぶ事前生成。マッチした案件の案内メール本文をLLMで先に整形し、
 * Project.formattedBody にキャッシュしておく。見比べの「メール送信」タブを
 * 開いた瞬間に表示できる（その場でLLM生成＝「生成中…」を出さない）ようにするため。
 * すでにキャッシュ済みの案件・本文が空の案件はスキップ（LLMを呼ばない＝コスト抑制）。
 */
export async function pregenerateProjectBodies(opts: {
  orgId: string;
  projectIds: string[];
  projectEmailPrompt: string | null;
  concurrency?: number;
}): Promise<{ generated: number }> {
  const ids = [...new Set(opts.projectIds)];
  if (ids.length === 0) return { generated: 0 };
  // 未整形（formattedBody が空）の案件だけ対象にする。
  const projects = await prisma.project.findMany({
    where: { orgId: opts.orgId, id: { in: ids } },
    select: { id: true, emailBody: true, description: true, formattedBody: true },
  });
  const todo = projects.filter(
    (p) => !(p.formattedBody ?? "").trim() && (p.emailBody || p.description || "").trim(),
  );
  let generated = 0;
  await mapLimit(todo, opts.concurrency ?? 3, async (p) => {
    const raw = p.emailBody || p.description || "";
    const block = await formatProjectBlock(raw, opts.projectEmailPrompt);
    if (block) {
      await prisma.project
        .update({ where: { id: p.id }, data: { formattedBody: block } })
        .catch(() => {});
      generated++;
    }
  });
  return { generated };
}

/**
 * 案件案内メール（案件→人材の紹介元へ）を組み立てる。送信はしない。
 * 整形結果は Project.formattedBody にキャッシュし、2回目以降は LLM を呼ばない。
 * 送信先が無い等のときは ok:false を返す（呼び出し側でスキップ/エラー表示）。
 */
export async function prepareProjectInfoMail(opts: {
  orgId: string;
  projectEmailPrompt: string | null;
  talentId: string;
  projectId: string;
  regenerate?: boolean;
}): Promise<PrepareResult> {
  const { orgId, projectEmailPrompt, talentId, projectId, regenerate } = opts;

  const [talent, project, lastSent] = await Promise.all([
    prisma.talent.findFirst({
      where: { id: talentId, orgId },
      select: {
        id: true,
        name: true,
        sourceEmail: true,
        emailFrom: true,
        contactName: true,
        emailBody: true,
      },
    }),
    prisma.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true, title: true, emailBody: true, description: true, formattedBody: true },
    }),
    prisma.sentEmail.findFirst({
      where: { orgId, talentId, projectId, kind: "PROJECT_INFO", status: "SENT" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  if (!talent || !project) {
    return { ok: false, status: 404, error: "人材または案件が見つかりません" };
  }

  const to = talent.sourceEmail ?? parseEmailAddr(talent.emailFrom);
  if (!to) {
    return {
      ok: false,
      status: 400,
      error: "送信先メールアドレスが不明です（この人材にメールが紐付いていません）",
    };
  }

  // 案件本文の整形。整形結果は案件にのみ依存するのでキャッシュし、再送信や別人材送信でLLMを呼ばない。
  // 通常はマッチ時に pregenerateProjectBodies で先に作られているのでここではキャッシュ命中する。
  const raw = project.emailBody || project.description || "";
  let block = !regenerate ? (project.formattedBody ?? "").trim() : "";
  if (!block) {
    block = await formatProjectBlock(raw, projectEmailPrompt);
    if (block && block !== transformProjectBody(raw)) {
      await prisma.project
        .update({ where: { id: project.id }, data: { formattedBody: block } })
        .catch(() => {});
    }
  }

  const { subject, text } = buildProjectEmail({
    talentName: talent.name,
    contactFrom: talent.emailFrom,
    contactName: talent.contactName,
    contactBody: talent.emailBody,
    projectTitle: project.title,
    projectBlock: block,
  });

  return { ok: true, mail: { to, subject, text, lastSentAt: lastSent?.createdAt ?? null } };
}

/** 案件案内メールを送信し、SentEmail に記録する。失敗時は FAILED を記録して throw。 */
export async function sendAndLogProjectInfo(opts: {
  orgId: string;
  talentId: string;
  projectId: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ id: string | null }> {
  const { orgId, talentId, projectId, to, subject, text } = opts;
  try {
    const { id } = await sendMail({ to, subject, text });
    await prisma.sentEmail.create({
      data: { orgId, talentId, projectId, kind: "PROJECT_INFO", toAddr: to, subject, body: text, status: "SENT" },
    });
    return { id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.sentEmail
      .create({
        data: {
          orgId,
          talentId,
          projectId,
          kind: "PROJECT_INFO",
          toAddr: to,
          subject,
          body: text,
          status: "FAILED",
          error: message.slice(0, 500),
        },
      })
      .catch(() => {});
    throw new Error(message);
  }
}
