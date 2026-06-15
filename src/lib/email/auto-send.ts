import { prisma } from "@/lib/prisma";
import { prepareProjectInfoMail, sendAndLogProjectInfo } from "@/lib/email/project-mail";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 今日(JST)の0:00をUTCのDateで返す。 */
function startOfTodayJst(): Date {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS);
}

export interface AutoSendResult {
  enabled: boolean;
  cap: number;
  sentTodayBefore: number; // 実行前の本日送信数（手動含む）
  candidates: number; // 送信対象（未送信）の件数
  sent: number;
  failed: number;
  skipped: number; // 送信先不明など
  capReached: boolean;
  remaining: number; // この回で送り切れず残った未送信数
  done: boolean; // 今回で対象を処理し切ったか（false ならループ継続）
}

/**
 * 案件案内メールの自動送信。日次マッチ後（GitHub Action）から呼ぶ。
 * 対象: 商流OK(proposable) かつ 80点以上 かつ「その日(JST)配信の案件」のマッチ で未送信のもの。
 * 「その日配信の案件」に限定することで過去のバックログを一斉送信しない（新規分のみ）。
 * 安全装置: org.autoEmailEnabled が false なら何もしない。1日の上限(autoEmailDailyCap)を超えたら停止
 *           （上限は手動送信も含めた本日の PROJECT_INFO 送信数で判定）。
 */
export async function runAutoSendProjectInfo(
  orgId: string,
  opts: { capOverride?: number; maxPerRun?: number } = {},
): Promise<AutoSendResult> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { autoEmailEnabled: true, autoEmailDailyCap: true, projectEmailPrompt: true },
  });

  // 上限: capOverride 優先。0以下は「上限なし（無制限）」。
  const cap = opts.capOverride ?? org?.autoEmailDailyCap ?? 20;
  const unlimited = cap <= 0;
  // 1回の呼び出しで送る最大数（タイムアウト回避。残りは次回ループで送る）。
  const maxPerRun = Math.max(1, opts.maxPerRun ?? 40);
  const base: AutoSendResult = {
    enabled: !!org?.autoEmailEnabled,
    cap,
    sentTodayBefore: 0,
    candidates: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    capReached: false,
    remaining: 0,
    done: true,
  };
  if (!org?.autoEmailEnabled) return base;

  const todayStart = startOfTodayJst();

  // 本日すでに送信済みの件数（手動送信も含めて上限に計上）。
  const sentTodayBefore = await prisma.sentEmail.count({
    where: { orgId, kind: "PROJECT_INFO", status: "SENT", createdAt: { gte: todayStart } },
  });
  base.sentTodayBefore = sentTodayBefore;
  let budget = unlimited ? Number.MAX_SAFE_INTEGER : cap - sentTodayBefore;
  if (!unlimited && budget <= 0) {
    base.capReached = true;
    return base;
  }

  // 対象マッチ: 商流OK・80点以上・「今日(JST)配信の案件 または 今日来た人材」。点数の高い順。
  const matches = await prisma.match.findMany({
    where: {
      proposable: true,
      score: { gte: 80 },
      OR: [
        { project: { orgId, receivedDate: { gte: todayStart } } },
        { talent: { orgId, receivedDate: { gte: todayStart } } },
      ],
    },
    select: { talentId: true, projectId: true },
    orderBy: { score: "desc" },
  });

  // 既送信ペアを除外（未送信のみ対象）。
  const sentPairs = matches.length
    ? await prisma.sentEmail.findMany({
        where: {
          orgId,
          kind: "PROJECT_INFO",
          status: "SENT",
          talentId: { in: [...new Set(matches.map((m) => m.talentId))] },
        },
        select: { talentId: true, projectId: true },
      })
    : [];
  const sentSet = new Set(sentPairs.map((p) => `${p.talentId}#${p.projectId}`));

  // 同一ペアの重複（名寄せ前の複数マッチ）も1回に。
  const pending: { talentId: string; projectId: string }[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const key = `${m.talentId}#${m.projectId}`;
    if (sentSet.has(key) || seen.has(key)) continue;
    seen.add(key);
    pending.push(m);
  }
  base.candidates = pending.length;

  let i = 0;
  for (; i < pending.length; i++) {
    const m = pending[i];
    if (budget <= 0) {
      base.capReached = true;
      break;
    }
    // 1回の呼び出しの上限（タイムアウト回避）。残りは done=false で次回へ。
    if (base.sent >= maxPerRun) break;
    const prep = await prepareProjectInfoMail({
      orgId,
      projectEmailPrompt: org.projectEmailPrompt,
      talentId: m.talentId,
      projectId: m.projectId,
    });
    if (!prep.ok || prep.mail.lastSentAt) {
      base.skipped++;
      continue;
    }
    try {
      await sendAndLogProjectInfo({
        orgId,
        talentId: m.talentId,
        projectId: m.projectId,
        to: prep.mail.to,
        subject: prep.mail.subject,
        text: prep.mail.text,
      });
      base.sent++;
      budget--;
    } catch {
      base.failed++;
    }
  }

  // 処理し切れず残ったペア数。capReached（日次上限到達）か全件処理済みなら done。
  base.remaining = pending.length - i;
  base.done = base.capReached || base.remaining === 0;
  return base;
}
