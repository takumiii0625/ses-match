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

// ---------- Skill normalization & implications (for precise pre-filtering) ----------

/**
 * If a talent has the KEY skill, they implicitly also have the VALUE skills.
 * This lets a "Spring Boot" engineer match a "Java" requirement, WITHOUT
 * matching unrelated languages — i.e. precise, not "same dev category".
 * Extend this dictionary as the team encounters new stacks.
 */
const SKILL_IMPLICATIONS: Record<string, string[]> = {
  "spring": ["java"],
  "spring boot": ["java", "spring"],
  "kotlin": ["jvm"],
  "scala": ["jvm"],
  "next.js": ["react", "javascript"],
  "nextjs": ["react", "javascript"],
  "react": ["javascript"],
  "vue": ["javascript"],
  "vue.js": ["javascript"],
  "angular": ["typescript", "javascript"],
  "typescript": ["javascript"],
  "node.js": ["javascript"],
  "nodejs": ["javascript"],
  "laravel": ["php"],
  "cakephp": ["php"],
  "symfony": ["php"],
  "django": ["python"],
  "flask": ["python"],
  "fastapi": ["python"],
  "rails": ["ruby"],
  "ruby on rails": ["ruby"],
  ".net": ["c#"],
  "asp.net": ["c#", ".net"],
  "ecs": ["aws"],
  "lambda": ["aws"],
  "s3": ["aws"],
  "amazon aurora": ["aws"],
  "rds": ["aws"],
  "gke": ["gcp"],
  "bigquery": ["gcp"],
  "aks": ["azure"],
  "sap s/4hana": ["sap"],
  "abap": ["sap"],
};

function normalize(skill: string): string {
  return skill.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Expand a talent's owned skills with implied skills (Spring → Java, etc.). */
export function expandSkills(skills: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of skills) {
    const s = normalize(raw);
    if (!s) continue;
    out.add(s);
    for (const implied of SKILL_IMPLICATIONS[s] ?? []) out.add(implied);
  }
  return out;
}

export interface PrefilterHit {
  talent: Talent;
  coreHits: number;
  coverage: number; // 0..1 of required skills covered
}

/**
 * Stage 1 of the matching funnel (no LLM): keep only candidates that actually
 * cover at least one of the project's required skills (by real skill / implied
 * skill — NOT by coarse tag). Sorted by coverage. Returns a small shortlist for
 * the LLM to re-rank. This is what makes "Java engineer for a PHP-only project"
 * get dropped instead of matching on a shared "開発" tag.
 */
export function prefilterCandidates(
  project: Project,
  talents: Talent[],
  limit = 30,
): PrefilterHit[] {
  const required = project.requiredSkills.map(normalize).filter(Boolean);

  const hits: PrefilterHit[] = [];
  for (const talent of talents) {
    const owned = expandSkills([...talent.skills, ...talent.mainSkills]);

    if (required.length === 0) {
      // No required skills specified → can't precisely filter; let LLM judge.
      hits.push({ talent, coreHits: 0, coverage: 0 });
      continue;
    }
    const coreHits = required.filter((r) => owned.has(r)).length;
    if (coreHits >= 1) {
      hits.push({ talent, coreHits, coverage: coreHits / required.length });
    }
  }

  hits.sort((a, b) => b.coverage - a.coverage || b.coreHits - a.coreHits);
  return hits.slice(0, limit);
}
