import { prisma } from "@/lib/prisma";
import { sendMail, buildProjectEmail, transformProjectBody } from "@/lib/email/send";
import { getAI } from "@/lib/ai";

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
  const raw = project.emailBody || project.description || "";
  let block = !regenerate ? (project.formattedBody ?? "").trim() : "";
  if (!block) {
    try {
      block = (await getAI().formatProjectBody(raw, projectEmailPrompt ?? undefined)).trim();
      if (block) {
        await prisma.project
          .update({ where: { id: project.id }, data: { formattedBody: block } })
          .catch(() => {});
      }
    } catch {
      /* フォールバックへ */
    }
    if (!block) block = transformProjectBody(raw);
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
      data: { orgId, talentId, projectId, kind: "PROJECT_INFO", toAddr: to, subject, status: "SENT" },
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
          status: "FAILED",
          error: message.slice(0, 500),
        },
      })
      .catch(() => {});
    throw new Error(message);
  }
}
