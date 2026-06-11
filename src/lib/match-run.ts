import type { Project, Talent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  prefilterCandidates,
  isSameCompany,
  isStrictDirectChannel,
  dedupeProjectsForMatch,
} from "@/lib/matching";
import { getAI } from "@/lib/ai";
import type { MatchProjectInput, MatchCandidateInput } from "@/lib/ai";

// マッチとして保存する最低スコア。rematch・取込後の自動マッチで共通。
export const MIN_SCORE = 80;

// 案件・他社人材は「直近3日の配信」に限定するが、自社保有人材(INHOUSE)は
// 常に対象（保有ロスターなので配信日に関係なく提案候補にする）。
const talentWindowWhere = (orgId: string, since: Date) => ({
  orgId,
  OR: [{ talentType: "INHOUSE" as const }, { receivedDate: { gte: since } }],
});

// 1案件あたりLLMに渡す候補の上限（事前フィルタ後の上位N件）。
const SHORTLIST_LIMIT = 30;

// 取込時の差分マッチで対象にする配信日の範囲（日数）。これより古い案件・人材はマッチしない。
export const MATCH_WINDOW_DAYS = 3;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 取込時の差分マッチ用：今からこの日数前まで。 */
function windowStart(): Date {
  return new Date(Date.now() - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** 今日(JST)の0:00をUTCのDateで返す。手動の全件マッチは「今日の配信」だけを対象にする。 */
function startOfTodayJst(): Date {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS);
}

/**
 * 商流が「貴社社員（まで）」「貴社まで」の案件は、弊社以遠の人材を提案できないため
 * マッチング対象から除外する（マッチを作らない）。
 */
function isOwnOnlyChannel(channelText: string | null): boolean {
  if (!channelText) return false;
  const t = channelText.replace(/\s/g, "");
  return /貴社社員|貴社まで|貴社迄|貴社のみ/.test(t);
}

/**
 * 商流による候補の事前足切り。
 * - 「貴社社員/貴社まで」案件 → 自社保有人材のみ（他社は不可）。
 * - 「エンド直/プロパー/直のみ」案件で支援費の記載なし → 弊社が挟まると提案不可なので
 *   他社人材を除外し自社保有人材のみ（支援費ありなら商流を飛ばせるので全員残す）。
 */
function restrictCandidatesByChannel(candidates: Talent[], project: Project): Talent[] {
  const ownOnly = isOwnOnlyChannel(project.channelText);
  const strictDirect = isStrictDirectChannel(project.channelText) && !project.supportFee;
  if (ownOnly || strictDirect) {
    return candidates.filter((t) => t.talentType === "INHOUSE");
  }
  return candidates;
}

export interface MatchRunResult {
  projects: number;
  talents: number;
  pairs: number; // LLM判定にかけた候補ペア数（事前フィルタ通過分）
  saved: number; // MIN_SCORE 以上で upsert したペア数
  errors: number; // LLM判定に失敗した案件数（1案件の失敗で全体を止めない）
  minScore: number;
}

function toProjectInput(p: Project): MatchProjectInput {
  return {
    title: p.title,
    clientName: p.clientName,
    requiredSkills: p.requiredSkills,
    rateMin: p.rateMin,
    rateMax: p.rateMax,
    remotePreference: p.remotePreference,
    location: p.location,
    startText: p.startText,
    description: p.description,
    channelText: p.channelText,
    supportFee: p.supportFee,
  };
}

function toCandidateInput(t: Talent): MatchCandidateInput {
  return {
    talentId: t.id,
    name: t.name,
    age: t.age,
    talentType: t.talentType,
    affiliation: t.affiliation,
    skills: [...new Set([...t.mainSkills, ...t.skills])],
    desiredRateMin: t.desiredRateMin,
    desiredRateMax: t.desiredRateMax,
    remotePreference: t.remotePreference,
    availabilityText: t.availabilityText,
    nearestStation: t.nearestStation,
    note: t.note,
  };
}

/** 組織のマッチ判定プロンプト（未設定なら null＝AI実装側の組み込みデフォルト）。 */
async function resolveMatchPrompt(orgId: string): Promise<string | undefined> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { matchPrompt: true },
  });
  return org?.matchPrompt ?? undefined;
}

/**
 * 1案件 × 候補人材リストを LLM 判定し、MIN_SCORE 以上を Match に upsert。
 * candidates は呼び出し側で「同一企業除外」済みであること。
 * 事前フィルタ（必須スキルのカバー）で UNFIT を構造的に落としてからLLMへ渡す。
 */
async function rankAndSave(
  project: Project,
  candidates: Talent[],
  systemPrompt: string | undefined,
): Promise<{ pairs: number; saved: number }> {
  const shortlist = prefilterCandidates(project, candidates, SHORTLIST_LIMIT);
  if (shortlist.length === 0) return { pairs: 0, saved: 0 };

  const ranked = await getAI().rankCandidates(
    toProjectInput(project),
    shortlist.map((h) => toCandidateInput(h.talent)),
    systemPrompt,
  );

  let saved = 0;
  for (const r of ranked) {
    if (r.score < MIN_SCORE) continue;
    const reasons = [
      ...r.strengths,
      ...r.concerns.map((c) => `懸念: ${c}`),
    ];
    if (reasons.length === 0 && r.reason) reasons.push(r.reason);
    const proposable = r.channelOk !== false; // 既定は提案可
    const channelNote = r.channelNote || null;
    await prisma.match.upsert({
      where: {
        talentId_projectId: { talentId: r.talentId, projectId: project.id },
      },
      create: {
        talentId: r.talentId,
        projectId: project.id,
        score: r.score,
        reasons,
        proposable,
        channelNote,
      },
      update: { score: r.score, reasons, proposable, channelNote },
    });
    saved++;
  }
  return { pairs: shortlist.length, saved };
}

export interface RematchPageResult {
  totalProjects: number; // 対象案件の総数（今日の配信のみ・名寄せ後）
  processed: number; // ここまでに処理した案件数（= 次回 offset）
  done: boolean; // 全件処理が完了したか
  talents: number;
  pairs: number;
  saved: number;
  errors: number;
  minScore: number;
}

/**
 * 組織内の全案件を LLM マッチング（手動「全件マッチ」/ rematch クロン用）。
 * offset/limit で案件を分割処理できる（1リクエストの時間を短く保ちタイムアウトを防ぐ）。
 * offset=0 のときだけクリーン再生成（既存マッチを全削除）する。
 */
export async function runMatchingForOrg(
  orgId: string,
  opts: { offset?: number; limit?: number; scope?: "all" | "inhouse" } = {},
): Promise<RematchPageResult> {
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = opts.limit && opts.limit > 0 ? opts.limit : Number.MAX_SAFE_INTEGER;
  const inhouseOnly = opts.scope === "inhouse";
  // 手動の全件マッチは「今日(JST)配信」の案件・他社人材のみ対象（自社人材は常に対象）。
  const since = startOfTodayJst();

  // inhouse スコープでは候補を自社保有人材だけに限定する。
  const talentWhere = inhouseOnly
    ? { orgId, talentType: "INHOUSE" as const }
    : talentWindowWhere(orgId, since);

  const [projectsRaw, talents, systemPrompt] = await Promise.all([
    // ページングを安定させるため作成日昇順で固定。
    prisma.project.findMany({
      where: { orgId, receivedDate: { gte: since } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.talent.findMany({ where: talentWhere }),
    resolveMatchPrompt(orgId),
  ]);

  // 同じ会社×件名の重複案件は、単価が高く商流が浅い方だけを代表に名寄せ（マッチ採用）。
  // 「貴社社員/貴社まで」案件は除外せず残し、候補を自社人材だけに絞る（下で対応）。
  const projectsAll = dedupeProjectsForMatch(projectsRaw);

  // クリーン再生成は先頭チャンクのみ。
  // 重要: 削除は「今回の対象（今日配信の案件）」に限定する。全マッチを消すと、
  // 窓外（過去日）のマッチまで消えて作り直されず、過去のマッチが消失してしまう。
  // inhouse スコープでは対象案件のうち自社人材のマッチだけ削除し、他社のマッチは残す。
  if (offset === 0) {
    const windowProjectIds = projectsRaw.map((p) => p.id);
    await prisma.match.deleteMany({
      where: {
        projectId: { in: windowProjectIds },
        ...(inhouseOnly ? { talent: { talentType: "INHOUSE" as const } } : {}),
      },
    });
  }

  const slice = projectsAll.slice(offset, offset + limit);

  // 案件を並列処理（実APIコールは matchLimiter で同時実行数が抑えられる）。
  const settled = await Promise.allSettled(
    slice.map((project) => {
      const candidates = restrictCandidatesByChannel(
        talents.filter((t) => !isSameCompany(t, project)),
        project,
      );
      return rankAndSave(project, candidates, systemPrompt);
    }),
  );

  let saved = 0;
  let pairs = 0;
  let errors = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      pairs += s.value.pairs;
      saved += s.value.saved;
    } else {
      errors++;
      console.error("[match] 案件のLLM判定に失敗:", s.reason);
    }
  }

  const processed = Math.min(offset + slice.length, projectsAll.length);
  return {
    totalProjects: projectsAll.length,
    processed,
    done: processed >= projectsAll.length,
    talents: talents.length,
    pairs,
    saved,
    errors,
    minScore: MIN_SCORE,
  };
}

/**
 * 取込直後の差分マッチング。
 * - 新規案件は全人材を候補に判定（LLM 1回/案件）。
 * - 既存案件は「今回の新規人材」だけを候補に判定（新規人材が事前フィルタを通る案件のみLLM呼び出し）。
 * これにより、新規が一切絡まない既存×既存は再計算せず、LLM呼び出しを案件数以内に抑える。
 */
export async function runMatchingForNew(
  orgId: string,
  newTalentIds: string[],
  newProjectIds: string[],
): Promise<MatchRunResult> {
  if (newTalentIds.length === 0 && newProjectIds.length === 0) {
    return {
      projects: 0,
      talents: 0,
      pairs: 0,
      saved: 0,
      errors: 0,
      minScore: MIN_SCORE,
    };
  }

  const since = windowStart();
  const [projectsRaw, talents, systemPrompt] = await Promise.all([
    prisma.project.findMany({ where: { orgId, receivedDate: { gte: since } } }),
    prisma.talent.findMany({ where: talentWindowWhere(orgId, since) }),
    resolveMatchPrompt(orgId),
  ]);

  // 同じ会社×件名の重複案件は、単価が高く商流が浅い方だけを代表に名寄せ（マッチ採用）。
  const projects = dedupeProjectsForMatch(projectsRaw);

  const isNewProject = new Set(newProjectIds);
  const isNewTalent = new Set(newTalentIds);

  // 新規が絡む案件だけを対象に並列マッチ（実APIコールは matchLimiter で抑制）。
  const targets = projects
    .map((project) => {
      // 新規案件→全人材、既存案件→新規人材のみ を候補に。
      const pool = isNewProject.has(project.id)
        ? talents
        : talents.filter((t) => isNewTalent.has(t.id));
      return { project, pool };
    })
    .filter(({ pool }) => pool.length > 0);

  const settled = await Promise.allSettled(
    targets.map(({ project, pool }) => {
      const candidates = restrictCandidatesByChannel(
        pool.filter((t) => !isSameCompany(t, project)),
        project,
      );
      return rankAndSave(project, candidates, systemPrompt);
    }),
  );

  let saved = 0;
  let pairs = 0;
  let errors = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      pairs += s.value.pairs;
      saved += s.value.saved;
    } else {
      errors++;
      console.error("[match] 案件のLLM判定に失敗:", s.reason);
    }
  }

  return {
    projects: projects.length,
    talents: talents.length,
    pairs,
    saved,
    errors,
    minScore: MIN_SCORE,
  };
}
