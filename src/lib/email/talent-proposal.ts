import { prisma } from "@/lib/prisma";
import { sendMail, buildTalentProposalEmail } from "@/lib/email/send";
import { buildTalentIntroBlock } from "@/lib/email/talent-block";

/** From ヘッダ等から素のメールアドレスを取り出す。 */
function parseEmail(s?: string | null): string | null {
  if (!s) return null;
  const m = s.match(/<([^>]+)>/) ?? s.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1].toLowerCase() : null;
}

export interface PreparedTalentProposal {
  to: string;
  subject: string;
  text: string;
  lastSentAt: Date | null; // この人材×案件に過去提案した最新日時（未送信なら null）
}

export type PrepareTalentResult =
  | { ok: true; mail: PreparedTalentProposal }
  | { ok: false; status: number; error: string };

/**
 * 自社マッチ用: 案件元（案件メールの送信者）へ要員を提案するメールを組み立てる。送信はしない。
 * 雛形固定・要員情報は人材固有のみ（LLM不使用・コストゼロ）。
 */
export async function prepareTalentProposalMail(opts: {
  orgId: string;
  talentId: string;
  projectId: string;
}): Promise<PrepareTalentResult> {
  const { orgId, talentId, projectId } = opts;
  const [talent, project, lastSent] = await Promise.all([
    prisma.talent.findFirst({
      where: { id: talentId, orgId },
      select: {
        id: true,
        name: true,
        summaryText: true,
        mainSkills: true,
        skills: true,
        desiredRateMin: true,
        desiredRateMax: true,
        availabilityText: true,
      },
    }),
    prisma.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true, title: true, sourceEmail: true, emailFrom: true, emailBody: true },
    }),
    prisma.sentEmail.findFirst({
      where: { orgId, talentId, projectId, kind: "TALENT_PROPOSAL", status: "SENT" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  if (!talent || !project) {
    return { ok: false, status: 404, error: "人材または案件が見つかりません" };
  }

  const to = project.sourceEmail ?? parseEmail(project.emailFrom);
  if (!to) {
    return {
      ok: false,
      status: 400,
      error: "送信先メールアドレスが不明です（この案件にメールが紐付いていません）",
    };
  }

  // 要員情報: 本人固有のみ（氏名見出し＋スキルシート要約 or 構造化項目）。
  const talentBlock = buildTalentIntroBlock(talent);
  const { subject, text } = buildTalentProposalEmail({
    contactFrom: project.emailFrom,
    contactBody: project.emailBody,
    projectTitle: project.title,
    talentBlock,
  });

  return { ok: true, mail: { to, subject, text, lastSentAt: lastSent?.createdAt ?? null } };
}

/** 要員提案メールを送信し、SentEmail に記録する。失敗時は FAILED を記録して throw。 */
export async function sendAndLogTalentProposal(opts: {
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
      data: { orgId, talentId, projectId, kind: "TALENT_PROPOSAL", toAddr: to, subject, body: text, status: "SENT" },
    });
    // 提案メールを送ったマッチは「人材提案」段階を自動でON（未設定のときのみ）。
    await prisma.match
      .updateMany({ where: { talentId, projectId, stTalent: null }, data: { stTalent: new Date() } })
      .catch(() => {});
    return { id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.sentEmail
      .create({
        data: {
          orgId,
          talentId,
          projectId,
          kind: "TALENT_PROPOSAL",
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
