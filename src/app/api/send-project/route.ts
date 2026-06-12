import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { sendMail, buildProjectEmail } from "@/lib/email/send";

export const maxDuration = 60;

/** From ヘッダ等から素のメールアドレスを取り出す。 */
function parseEmail(s?: string | null): string | null {
  if (!s) return null;
  const m = s.match(/<([^>]+)>/) ?? s.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1].toLowerCase() : null;
}

export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const { talentId, projectId } = (await req.json()) as {
      talentId?: string;
      projectId?: string;
    };
    if (!talentId || !projectId) {
      return NextResponse.json(
        { error: "talentId と projectId が必要です" },
        { status: 400 },
      );
    }

    const [talent, project] = await Promise.all([
      prisma.talent.findFirst({
        where: { id: talentId, orgId: org.id },
        select: { id: true, name: true, sourceEmail: true, emailFrom: true },
      }),
      prisma.project.findFirst({
        where: { id: projectId, orgId: org.id },
        select: { id: true, title: true, emailBody: true, description: true },
      }),
    ]);

    if (!talent || !project) {
      return NextResponse.json({ error: "人材または案件が見つかりません" }, { status: 404 });
    }

    const to = talent.sourceEmail ?? parseEmail(talent.emailFrom);
    if (!to) {
      return NextResponse.json(
        { error: "送信先メールアドレスが不明です（この人材にメールが紐付いていません）" },
        { status: 400 },
      );
    }

    const { subject, text } = buildProjectEmail({
      talentName: talent.name,
      contactFrom: talent.emailFrom,
      projectTitle: project.title,
      projectBody: project.emailBody || project.description || "",
    });

    try {
      const { id } = await sendMail({ to, subject, text });
      await prisma.sentEmail.create({
        data: { orgId: org.id, talentId, projectId, toAddr: to, subject, status: "SENT" },
      });
      return NextResponse.json({ ok: true, id, to });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await prisma.sentEmail
        .create({
          data: { orgId: org.id, talentId, projectId, toAddr: to, subject, status: "FAILED", error: message.slice(0, 500) },
        })
        .catch(() => {});
      return NextResponse.json({ error: `送信に失敗しました: ${message}` }, { status: 502 });
    }
  } catch (err) {
    console.error("[POST /api/send-project]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
