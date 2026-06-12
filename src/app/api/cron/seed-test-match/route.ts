import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { sendMail, buildProjectEmail, transformProjectBody } from "@/lib/email/send";
import { getAI } from "@/lib/ai";
import { cronAuthorized } from "@/lib/cron-auth";

export const maxDuration = 60;

const TEST_EMAIL = "t.arai@obfall.co.jp";
const PROJECT_TITLE = "外資系製薬業向け業務整理・グローバル連携コンサルタント募集";
const PROJECT_BODY = `■案件名：
　外資系製薬業向け業務整理・グローバル連携コンサルタント募集
■案件内容：
　•外資系製薬企業向け案件
　•日本特有の商習慣に対応したSAPアドオン環境において、受注〜出荷〜請求プロセスの業務整理およびシステム紐付け整理を実施
　•属人化していた業務の可視化、業務フローとSAP機能のマッピング整理
　•グローバルチームとの連携を含む課題整理・調整支援
＜作業内容＞
　・業務ヒアリングおよび業務プロセス整理
　•業務とSAP機能（標準／アドオン）の紐付け整理
　•ドキュメント作成（業務フロー、機能一覧 等）
　•グローバルチームとのコミュニケーション（英語）
　•課題整理および改善提案
■担当工程：
　SD/MM コンサルタント
■作業場所：
　基本はリモートだが、必要に応じて顧客事業所へ出社頂く可能性あり（兵庫）
■単価：
　スキル見合い
■必要スキル：
　・SAP（SD領域中心：受注〜出荷〜請求）の知見
　・業務整理／業務可視化の経験
　＜歓迎スキル＞
　・SAPアドオン／ローカライズ対応の経験
　・BPO／業務移管プロジェクトの経験
　・製薬業界または卸業界の知見
　・英語ビジネスレベル（会議対応が可能なレベル）
　＜人物像＞
　・不明点が多い環境でも主体的に整理・推進できる方
　・業務とシステムの両面から思考できる方
　・グローバル環境でのコミュニケーションに抵抗がない方
■契約期間：
　6月～中長期
■支払サイト：
　月末締め翌月末支払い
■募集人数：
　1名
■契約形態：
　準委任
■商流：
　元請（決裁企業）
■商談：
　Web1回（当社同席）
■年齢：
　指定なし
■外国籍可否：
　日本語がネイティブであれば国籍不問です。
■個人事業主可否：
　可
■備考：
　・勤務時間：一部、時差対応（夜間会議）の可能性あり`;

export async function POST(req: Request) {
  if (!(await cronAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const org = await getCurrentOrg();

    // 冪等: 既にあれば再利用（重複作成しない）
    let project = await prisma.project.findFirst({
      where: { orgId: org.id, title: PROJECT_TITLE },
    });
    if (!project) {
      project = await prisma.project.create({
        data: {
          orgId: org.id,
          dataFrom: "EMAIL",
          title: PROJECT_TITLE,
          requiredSkills: ["SAP", "SD", "業務整理"],
          location: "兵庫",
          startText: "6月～中長期",
          channelText: "元請（決裁企業）",
          description: PROJECT_BODY.slice(0, 600),
          emailBody: PROJECT_BODY,
          emailSubject: PROJECT_TITLE,
          sourceEmail: "seed@dummy.local",
          receivedDate: new Date(),
        },
      });
    }

    let talent = await prisma.talent.findFirst({
      where: { orgId: org.id, sourceEmail: TEST_EMAIL },
    });
    if (!talent) {
      talent = await prisma.talent.create({
        data: {
          orgId: org.id,
          talentType: "PARTNER",
          dataFrom: "EMAIL",
          name: "T.A",
          mainSkills: ["SAP"],
          skills: ["SAP", "SD", "業務整理"],
          emailSubject: "【ご紹介】SAPコンサル T.A様",
          emailFrom: `新井 <${TEST_EMAIL}>`,
          sourceEmail: TEST_EMAIL,
          receivedDate: new Date(),
        },
      });
    }

    const match = await prisma.match.upsert({
      where: { talentId_projectId: { talentId: talent.id, projectId: project.id } },
      create: {
        talentId: talent.id,
        projectId: project.id,
        score: 92,
        reasons: ["テスト用ダミーマッチ", "SAP/SD 一致"],
        proposable: true,
        channelNote: null,
      },
      update: { score: 92, proposable: true },
    });

    // その場でテスト送信
    const raw = project.emailBody ?? project.description ?? "";
    let block: string;
    try {
      block = await getAI().formatProjectBody(raw, org.projectEmailPrompt ?? undefined);
      if (!block.trim()) block = transformProjectBody(raw);
    } catch {
      block = transformProjectBody(raw);
    }
    const { subject, text } = buildProjectEmail({
      talentName: talent.name,
      contactFrom: talent.emailFrom,
      projectTitle: project.title,
      projectBlock: block,
    });
    let sent: { id: string | null } | null = null;
    let sendError: string | null = null;
    try {
      sent = await sendMail({ to: TEST_EMAIL, subject, text });
      await prisma.sentEmail.create({
        data: { orgId: org.id, talentId: talent.id, projectId: project.id, toAddr: TEST_EMAIL, subject, status: "SENT" },
      });
    } catch (e) {
      sendError = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({
      ok: true,
      to: TEST_EMAIL,
      projectId: project.id,
      talentId: talent.id,
      matchId: match.id,
      sent,
      sendError,
      preview: text,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
