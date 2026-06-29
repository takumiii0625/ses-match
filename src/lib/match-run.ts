import { Prisma, type Project, type Talent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  prefilterCandidates,
  isSameCompany,
  isStrictDirectChannel,
  dedupeProjectsForMatch,
} from "@/lib/matching";
import { getAI } from "@/lib/ai";
import type { MatchProjectInput, MatchCandidateInput } from "@/lib/ai";
import { DEFAULT_MATCH_PROMPT } from "@/lib/ai/prompts";
import { pregenerateProjectBodies } from "@/lib/email/project-mail";
import { loadNgDomains, isNgDomain } from "@/lib/ng-company";

// マッチとして保存する最低スコア。rematch・取込後の自動マッチで共通。
export const MIN_SCORE = 70;

// マッチ処理で実際に使う列だけ取得する。emailBody（フルのメール本文）等の重い列を
// 読まないことで、Neonのネットワーク転送量を大幅に削減する（無料枠の超過対策）。
const TALENT_MATCH_SELECT = {
  id: true,
  name: true,
  age: true,
  nationality: true,
  talentType: true,
  kishaOk: true,
  affiliation: true,
  mainSkills: true,
  skills: true,
  desiredRateMin: true,
  desiredRateMax: true,
  remotePreference: true,
  availabilityText: true,
  nearestStation: true,
  note: true,
  sourceEmail: true,
} satisfies Prisma.TalentSelect;

const PROJECT_MATCH_SELECT = {
  id: true,
  title: true,
  clientName: true,
  requiredSkills: true,
  rateMin: true,
  rateMax: true,
  remotePreference: true,
  location: true,
  startText: true,
  description: true,
  channelText: true,
  supportFee: true,
  sourceEmail: true,
  emailSubject: true,
  receivedDate: true,
} satisfies Prisma.ProjectSelect;

// 案件・他社人材は「直近に取り込んだ分」に限定するが、自社保有人材(INHOUSE)は
// 常に対象（保有ロスターなので取込日に関係なく提案候補にする）。
// 窓の基準は createdAt(取込日)。receivedDate(メール配信日)は古いバックログを取り込むと
// 当日でも過去日付になり窓から外れてしまうため使わない（取込したのに未マッチを防ぐ）。
const talentWindowWhere = (orgId: string, since: Date) => ({
  orgId,
  OR: [{ talentType: "INHOUSE" as const }, { createdAt: { gte: since } }],
});

// 1案件あたりLLMに渡す候補の上限（事前フィルタ後の上位N件）。
const SHORTLIST_LIMIT = 30;

// 取込時の差分マッチで対象にする取込日(createdAt)の範囲（日数）。これより前に取り込んだ案件・人材はマッチしない。
export const MATCH_WINDOW_DAYS = 3;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 取込時の差分マッチ用：今からこの日数前まで。 */
function windowStart(): Date {
  return new Date(Date.now() - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** 今日(JST)の0:00をUTCのDateで返す。手動の全件マッチは「今日の取込」だけを対象にする。 */
function startOfTodayJst(): Date {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS);
}

/**
 * 商流が「貴社まで＝受信会社(貴社)止まり」の案件か。弊社以遠の人材を提案できないため
 * マッチング対象を貴社チェック付き自社人材だけに絞る（restrictCandidatesByChannel）。
 *
 * 表現ゆれに強く判定する: 貴社/御社 の直後に
 * 「正社員 / 社員 / プロパー / 直 / まで / 迄 / のみ」が続くものを「貴社止まり」とみなす。
 * 例: 貴社まで・貴社迄・貴社のみ・貴社社員・貴社正社員(まで)・貴社プロパー・貴社直(まで)。
 * 「貴社の2社先まで」「貴社から1社先」等（貴社の直後が の/から）は対象外（誤検知しない）。
 */
function isOwnOnlyChannel(channelText: string | null): boolean {
  if (!channelText) return false;
  const t = channelText.replace(/\s/g, "");
  return /(貴社|御社)(正?社員|プロパー|直|まで|迄|のみ)/.test(t);
}

/**
 * 商流による候補の事前足切り。
 * - 「貴社社員/貴社まで」案件 → 自社保有人材のうち「貴社チェック(kishaOk)」が付いた人材のみ。
 *   （貴社まで案件は貴社レベルの人材しか提案できないため、対象人材を明示的に絞る）
 * - 「エンド直/プロパー/直のみ」案件で支援費の記載なし → 弊社が挟まると提案不可なので
 *   他社人材を除外し自社保有人材のみ（支援費ありなら商流を飛ばせるので全員残す）。
 */
function restrictCandidatesByChannel(candidates: Talent[], project: Project): Talent[] {
  const ownOnly = isOwnOnlyChannel(project.channelText);
  if (ownOnly) {
    return candidates.filter((t) => t.talentType === "INHOUSE" && t.kishaOk === true);
  }
  const strictDirect = isStrictDirectChannel(project.channelText) && !project.supportFee;
  if (strictDirect) {
    return candidates.filter((t) => t.talentType === "INHOUSE");
  }
  return candidates;
}

/**
 * 取引NG企業による候補の除外。
 * - 自社保有人材(INHOUSE)はNG企業でも提案対象に含める（NG企業の案件にも自社人材は出す）。
 * - 案件の会社がNG → 他社人材は提案しない（除外）。
 * - 人材の会社がNG → その他社人材は除外。
 */
function restrictCandidatesByNg(candidates: Talent[], ng: Set<string>): Talent[] {
  if (ng.size === 0) return candidates;
  // NG企業の「人材」は提案しない（除外）。NG企業の「案件」は通常どおりマッチ可
  // （他社人材ともマッチさせる）。自社保有人材は常に対象。
  return candidates.filter((t) => {
    if (t.talentType === "INHOUSE") return true;
    return !isNgDomain(t.sourceEmail, ng);
  });
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
    nationality: t.nationality,
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

/** 組織のマッチ判定プロンプト＋案件メール整形＋差し戻し学習（未設定なら null）。 */
async function resolveOrgPrompts(
  orgId: string,
): Promise<{ matchPrompt: string | undefined; projectEmailPrompt: string | null }> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { matchPrompt: true, projectEmailPrompt: true, matchLearnings: true },
  });
  // 差し戻し学習があれば、マッチ判定プロンプトに「提案不可＝除外」の指示として付加する。
  const base = org?.matchPrompt ?? DEFAULT_MATCH_PROMPT;
  const learnings = org?.matchLearnings?.trim();
  const matchPrompt = learnings
    ? `${base}\n\n【営業の差し戻し傾向（過去に営業が「送らない」と判断したパターン。以下に明確に該当するマッチは提案不可とみなし、score を MIN_SCORE 未満まで大きく下げて除外する。曖昧なものは通常どおり判定）】\n${learnings}`
    : base;
  return {
    matchPrompt,
    projectEmailPrompt: org?.projectEmailPrompt ?? null,
  };
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
    // 勤務地・勤務形態（常駐/リモート/出社頻度）が両立しない場合はマッチを作らない（除外）。
    if (r.locationOk === false) continue;
    // 年齢制限オーバー／国籍要件（外国籍不可）／単価が明確不成立の場合もマッチを作らない（除外）。
    if (r.ageOk === false) continue;
    if (r.nationalityOk === false) continue;
    if (r.rateOk === false) continue;
    const reasons = [
      ...r.strengths,
      ...r.concerns.map((c) => `懸念: ${c}`),
    ];
    if (reasons.length === 0 && r.reason) reasons.push(r.reason);
    const proposable = r.channelOk !== false; // 既定は提案可
    const channelNote = r.channelNote || null;
    // ここに到達＝勤務地・勤務形態は不一致でない（true か 不明）。OKラベル用に保存。
    const locationOk = r.locationOk ?? null;
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
        locationOk,
      },
      update: { score: r.score, reasons, proposable, channelNote, locationOk },
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
  opts: {
    offset?: number;
    limit?: number;
    scope?: "all" | "inhouse";
    sinceDays?: number; // 対象とする配信日の幅（1=今日のみ。例 3=今日含む直近3日）
  } = {},
): Promise<RematchPageResult> {
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = opts.limit && opts.limit > 0 ? opts.limit : Number.MAX_SAFE_INTEGER;
  const inhouseOnly = opts.scope === "inhouse";
  // 既定は「今日(JST)取込分」のみ。sinceDays で過去に遡る（過去マッチの復旧用）。
  // 窓の基準は createdAt(取込日)。配信日(receivedDate)はバックログ取込で過去日付になり
  // 当日取込でも窓から外れるため使わない。自社人材は常に対象。
  const sinceDays = opts.sinceDays && opts.sinceDays > 0 ? opts.sinceDays : 1;
  const todayStart = startOfTodayJst();
  const since =
    sinceDays <= 1
      ? todayStart
      : new Date(todayStart.getTime() - (sinceDays - 1) * 24 * 60 * 60 * 1000);

  // inhouse スコープでは候補を自社保有人材だけに限定する。
  const talentWhere = inhouseOnly
    ? { orgId, talentType: "INHOUSE" as const }
    : talentWindowWhere(orgId, since);

  const [projectsRaw, talents, prompts, ngDomains] = await Promise.all([
    // ページングを安定させるため作成日昇順で固定。必要列のみ取得（転送量削減）。
    prisma.project.findMany({
      where: { orgId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: PROJECT_MATCH_SELECT,
    }) as unknown as Promise<Project[]>,
    prisma.talent.findMany({
      where: talentWhere,
      select: TALENT_MATCH_SELECT,
    }) as unknown as Promise<Talent[]>,
    resolveOrgPrompts(orgId),
    loadNgDomains(orgId),
  ]);
  const systemPrompt = prompts.matchPrompt;

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
    slice.map(async (project) => {
      const candidates = restrictCandidatesByNg(
        restrictCandidatesByChannel(
          talents.filter((t) => !isSameCompany(t, project)),
          project,
        ),
        ngDomains,
      );
      const r = await rankAndSave(project, candidates, systemPrompt);
      return { projectId: project.id, ...r };
    }),
  );

  let saved = 0;
  let pairs = 0;
  let errors = 0;
  const matchedProjectIds: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      pairs += s.value.pairs;
      saved += s.value.saved;
      if (s.value.saved > 0) matchedProjectIds.push(s.value.projectId);
    } else {
      errors++;
      console.error("[match] 案件のLLM判定に失敗:", s.reason);
    }
  }

  // マッチした案件の案内メール本文を先に整形してキャッシュ（見比べ「メール送信」タブを即表示にする）。
  await pregenerateProjectBodies({
    orgId,
    projectIds: matchedProjectIds,
    projectEmailPrompt: prompts.projectEmailPrompt,
  }).catch((e) => console.error("[match] メール本文の事前生成に失敗:", e));

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
  const [projectsRaw, talents, prompts, ngDomains] = await Promise.all([
    prisma.project.findMany({
      // 取込日(createdAt)基準。配信日(receivedDate)だと古いメール取込が窓外になる。
      where: { orgId, createdAt: { gte: since } },
      select: PROJECT_MATCH_SELECT,
    }) as unknown as Promise<Project[]>,
    prisma.talent.findMany({
      where: talentWindowWhere(orgId, since),
      select: TALENT_MATCH_SELECT,
    }) as unknown as Promise<Talent[]>,
    resolveOrgPrompts(orgId),
    loadNgDomains(orgId),
  ]);
  const systemPrompt = prompts.matchPrompt;

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
    targets.map(async ({ project, pool }) => {
      const candidates = restrictCandidatesByNg(
        restrictCandidatesByChannel(
          pool.filter((t) => !isSameCompany(t, project)),
          project,
        ),
        ngDomains,
      );
      const r = await rankAndSave(project, candidates, systemPrompt);
      return { projectId: project.id, ...r };
    }),
  );

  let saved = 0;
  let pairs = 0;
  let errors = 0;
  const matchedProjectIds: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      pairs += s.value.pairs;
      saved += s.value.saved;
      if (s.value.saved > 0) matchedProjectIds.push(s.value.projectId);
    } else {
      errors++;
      console.error("[match] 案件のLLM判定に失敗:", s.reason);
    }
  }

  // マッチした案件の案内メール本文を先に整形してキャッシュ（見比べ「メール送信」タブを即表示にする）。
  await pregenerateProjectBodies({
    orgId,
    projectIds: matchedProjectIds,
    projectEmailPrompt: prompts.projectEmailPrompt,
  }).catch((e) => console.error("[match] メール本文の事前生成に失敗:", e));

  return {
    projects: projects.length,
    talents: talents.length,
    pairs,
    saved,
    errors,
    minScore: MIN_SCORE,
  };
}
