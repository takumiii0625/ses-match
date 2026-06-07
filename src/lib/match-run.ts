import type { Project, Talent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prefilterCandidates, isSameCompany } from "@/lib/matching";
import { getAI } from "@/lib/ai";
import type { MatchProjectInput, MatchCandidateInput } from "@/lib/ai";

// マッチとして保存する最低スコア。rematch・取込後の自動マッチで共通。
export const MIN_SCORE = 50;

// 1案件あたりLLMに渡す候補の上限（事前フィルタ後の上位N件）。
const SHORTLIST_LIMIT = 30;

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
  };
}

function toCandidateInput(t: Talent): MatchCandidateInput {
  return {
    talentId: t.id,
    name: t.name,
    age: t.age,
    talentType: t.talentType,
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
    await prisma.match.upsert({
      where: {
        talentId_projectId: { talentId: r.talentId, projectId: project.id },
      },
      create: {
        talentId: r.talentId,
        projectId: project.id,
        score: r.score,
        reasons,
      },
      update: { score: r.score, reasons },
    });
    saved++;
  }
  return { pairs: shortlist.length, saved };
}

/**
 * 組織内の全案件を LLM マッチング（rematch クロン／手動「全件マッチ」用）。
 * 各案件につきLLM呼び出しは最大1回（候補はまとめて1リクエストで判定）。
 */
export async function runMatchingForOrg(orgId: string): Promise<MatchRunResult> {
  const [projects, talents, systemPrompt] = await Promise.all([
    prisma.project.findMany({ where: { orgId } }),
    prisma.talent.findMany({ where: { orgId } }),
    resolveMatchPrompt(orgId),
  ]);

  let saved = 0;
  let pairs = 0;
  let errors = 0;
  for (const project of projects) {
    const candidates = talents.filter((t) => !isSameCompany(t, project));
    try {
      const r = await rankAndSave(project, candidates, systemPrompt);
      pairs += r.pairs;
      saved += r.saved;
    } catch (e) {
      errors++;
      console.error(`[match] project ${project.id} のLLM判定に失敗:`, e);
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

  const [projects, talents, systemPrompt] = await Promise.all([
    prisma.project.findMany({ where: { orgId } }),
    prisma.talent.findMany({ where: { orgId } }),
    resolveMatchPrompt(orgId),
  ]);

  const isNewProject = new Set(newProjectIds);
  const isNewTalent = new Set(newTalentIds);

  let saved = 0;
  let pairs = 0;
  let errors = 0;
  for (const project of projects) {
    // 新規案件→全人材、既存案件→新規人材のみ を候補に。
    const pool = isNewProject.has(project.id)
      ? talents
      : talents.filter((t) => isNewTalent.has(t.id));
    if (pool.length === 0) continue;

    const candidates = pool.filter((t) => !isSameCompany(t, project));
    try {
      const r = await rankAndSave(project, candidates, systemPrompt);
      pairs += r.pairs;
      saved += r.saved;
    } catch (e) {
      errors++;
      console.error(`[match] project ${project.id} のLLM判定に失敗:`, e);
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
