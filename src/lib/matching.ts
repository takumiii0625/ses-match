import type { Talent, Project } from "@prisma/client";

export interface MatchResult {
  score: number; // 0..100
  reasons: string[];
}

const REMOTE_RANK: Record<string, number> = {
  FULL_REMOTE: 0,
  MOSTLY_REMOTE: 1,
  HYBRID: 2,
  OFFICE_1: 3,
  OFFICE_2: 4,
  OFFICE_3: 5,
  OFFICE_4: 6,
  ONSITE: 7,
};

/**
 * Pure scoring function for talent×project compatibility.
 * Weighted: skills 60, rate 20, remote 10, availability 10.
 */
export function scoreMatch(talent: Talent, project: Project): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  // --- skills (60) ---
  const required = project.requiredSkills.map((s) => s.toLowerCase());
  const owned = new Set(
    [...talent.skills, ...talent.mainSkills].map((s) => s.toLowerCase()),
  );
  if (required.length > 0) {
    const hits = required.filter((s) => owned.has(s));
    const ratio = hits.length / required.length;
    score += ratio * 60;
    if (hits.length > 0) {
      reasons.push(
        `必須スキル ${required.length} 件中 ${hits.length} 件一致（${Math.round(ratio * 100)}%）`,
      );
    }
  } else {
    score += 30; // no requirement specified → neutral
  }

  // --- rate (20) ---
  if (project.rateMax != null && talent.desiredRateMin != null) {
    if (talent.desiredRateMin <= project.rateMax) {
      score += 20;
      reasons.push(`単価適合（希望${talent.desiredRateMin}万 ≤ 上限${project.rateMax}万）`);
    } else {
      reasons.push(`単価超過（希望${talent.desiredRateMin}万 > 上限${project.rateMax}万）`);
    }
  } else {
    score += 10;
  }

  // --- remote (10) ---
  if (project.remotePreference && talent.remotePreference) {
    const pr = REMOTE_RANK[project.remotePreference];
    const tr = REMOTE_RANK[talent.remotePreference];
    // talent willing to come to office at least as often as project requires
    if (tr >= pr) {
      score += 10;
      reasons.push("リモート条件が合致");
    } else {
      reasons.push("出社頻度の条件に差異あり");
    }
  } else {
    score += 5;
  }

  // --- availability (10) ---
  if (talent.availabilityText || talent.availabilityDate) {
    score += 10;
  }

  return { score: Math.round(Math.min(100, score)), reasons };
}
