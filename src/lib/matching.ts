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

// ---------- Same-company exclusion ----------
// SESの仲介では「同じ会社の人材を、その会社の案件に提案する」のは無意味。
// 送信元メールのドメインで同一企業を判定して除外する。
// フリーメール(gmail等)は会社を特定できないため判定対象外（除外しない）。

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.co.jp",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.jp",
  "live.jp",
  "icloud.com",
  "me.com",
  "docomo.ne.jp",
  "ezweb.ne.jp",
  "au.com",
  "softbank.ne.jp",
  "nifty.com",
  "ocn.ne.jp",
]);

/** Company domain from an email, or null for free-mail / missing. */
export function companyDomain(email?: string | null): string | null {
  if (!email) return null;
  const m = email.match(/@([A-Za-z0-9.-]+)/);
  if (!m) return null;
  const d = m[1].toLowerCase();
  return FREE_MAIL_DOMAINS.has(d) ? null : d;
}

/** True if talent and project clearly originate from the same company. */
export function isSameCompany(
  talent: { sourceEmail?: string | null },
  project: { sourceEmail?: string | null },
): boolean {
  const td = companyDomain(talent.sourceEmail);
  const pd = companyDomain(project.sourceEmail);
  return !!td && !!pd && td === pd;
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
// 金額足切りの許容マージン（万円）。交渉余地を考慮し、これ以内の超過は通す。
const RATE_MARGIN_MAN = 10;
// スキル/言語の最低カバー率。必須スキルのこの割合以上を満たす候補だけLLM判定に通す（足切り）。
// ※0.6に上げたらSES案件は必須+歓迎で多数スキルを列挙するため、ほぼ全候補が落ちてマッチ激減した
//   （597案件×706人材で saved=0）。実証済みの 0.5 に戻す。強めるとしても 0.55 程度まで。
const MIN_COVERAGE = Number(process.env.MATCH_MIN_COVERAGE ?? "0.5") || 0.5;

/** エンド直/プロパー/直のみ等、弊社が挟まると提案できない厳格商流か。 */
export function isStrictDirectChannel(channelText: string | null): boolean {
  if (!channelText) return false;
  return /エンド直|プロパー|直のみ|直案件/.test(channelText.replace(/\s/g, ""));
}

/**
 * 商流の深さ（小さいほど浅い＝エンド寄りで取り分が大きい）。
 * 例: エンド直/プロパー=0、1社先=1、2社先=2、不明=99。
 */
export function channelDepth(channelText: string | null): number {
  if (!channelText) return 99; // 不明は深い扱い（既知の浅い方を優先する）
  const t = channelText.replace(/\s/g, "");
  if (/エンド直|直案件|直のみ|プロパー/.test(t)) return 0;
  const num = t.match(/(\d+)\s*社/);
  if (num) return Number(num[1]);
  const kanjiMap: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };
  const kanji = t.match(/([一二三四五])社/);
  if (kanji) return kanjiMap[kanji[1]];
  if (/貴社/.test(t)) return 1; // 貴社まで＝受信側まで（概ね浅め）
  return 50; // 文言はあるが深さ不明
}

/** 件名の正規化（Re:/Fwd: 等の接頭辞を除去して比較しやすくする）。 */
function subjectKey(subject: string | null): string {
  let s = (subject ?? "").toLowerCase().replace(/\s+/g, "");
  // 先頭の re: / fwd: / fw: を繰り返し除去。
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/^(re|fwd|fw|転送|返信)[:：]/, "");
  }
  return s;
}

/** 重複案件のうち、単価が高く商流が浅い方を代表に選ぶ。 */
function betterProject(a: Project, b: Project): Project {
  const ra = a.rateMax ?? a.rateMin ?? -1;
  const rb = b.rateMax ?? b.rateMin ?? -1;
  if (ra !== rb) return ra > rb ? a : b; // 単価が高い方
  const da = channelDepth(a.channelText);
  const db = channelDepth(b.channelText);
  if (da !== db) return da < db ? a : b; // 商流が浅い方
  const ta = a.receivedDate ? a.receivedDate.getTime() : 0;
  const tb = b.receivedDate ? b.receivedDate.getTime() : 0;
  return ta >= tb ? a : b; // タイブレークは新しい配信
}

/**
 * マッチ用の案件重複名寄せ。同じ会社（送信元ドメイン）が同じ件名で配信した案件を
 * 重複とみなし、単価が高く商流が浅い方だけを代表として残す。
 * 会社が特定できない（フリーメール等）案件は名寄せしない（取りこぼし防止）。
 */
export function dedupeProjectsForMatch(projects: Project[]): Project[] {
  const map = new Map<string, Project>();
  for (const p of projects) {
    const domain = companyDomain(p.sourceEmail);
    const key = domain
      ? `${domain}#${subjectKey(p.emailSubject ?? p.title)}`
      : `id#${p.id}`; // 会社不明は名寄せしない
    const cur = map.get(key);
    map.set(key, cur ? betterProject(cur, p) : p);
  }
  return [...map.values()];
}

export function prefilterCandidates(
  project: Project,
  talents: Talent[],
  limit = 30,
): PrefilterHit[] {
  const required = project.requiredSkills.map(normalize).filter(Boolean);

  const hits: PrefilterHit[] = [];
  for (const talent of talents) {
    // 金額足切り: 人材の希望下限が案件上限＋マージンを超えるなら予算不一致で除外。
    if (
      project.rateMax != null &&
      talent.desiredRateMin != null &&
      talent.desiredRateMin > project.rateMax + RATE_MARGIN_MAN
    ) {
      continue;
    }

    const owned = expandSkills([...talent.skills, ...talent.mainSkills]);

    if (required.length === 0) {
      // 必須スキル未指定 → スキルで絞れないのでLLM判定に委ねる（金額足切りは適用済み）。
      hits.push({ talent, coreHits: 0, coverage: 0 });
      continue;
    }
    const coreHits = required.filter((r) => owned.has(r)).length;
    const coverage = coreHits / required.length;
    // 言語/スキルを厳しく: カバー率が閾値未満なら除外。
    if (coverage >= MIN_COVERAGE) {
      hits.push({ talent, coreHits, coverage });
    }
  }

  hits.sort((a, b) => b.coverage - a.coverage || b.coreHits - a.coreHits);
  return hits.slice(0, limit);
}
