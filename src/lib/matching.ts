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
  // 言語の表記ゆれを正規化（js→javascript 等）。言語ゲートで拾えるようにする。
  "js": ["javascript"],
  "ts": ["typescript", "javascript"],
  "golang": ["go"],
};

/**
 * プログラミング言語の集合（正規化済みトークン）。SESで最も重要な「言語の一致」を
 * 決定的に判定するために使う。フレームワーク/DB/クラウド/OS等はここに入れない（それらは点数で見る）。
 * 包含(Spring→java, Laravel→php 等)は SKILL_IMPLICATIONS で言語に展開される。
 */
const LANGUAGES = new Set<string>([
  "java", "php", "python", "ruby", "go", "c#", "c++", "c",
  "javascript", "typescript", "kotlin", "scala", "swift", "rust",
  "perl", "vb", "vb.net", "vba", "visual basic", "cobol", "r",
  "objective-c", "dart", "elixir", "groovy", "abap", "pl/sql",
]);

/** スキル集合（展開済み）から言語だけを取り出す。 */
function languagesOf(expanded: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const s of expanded) if (LANGUAGES.has(s)) out.add(s);
  return out;
}

/**
 * 案件が要求する「言語」の集合。requiredSkills を包含展開し、その中の言語トークンを拾う。
 * 例:「Java, Spring Boot, AWS」→ {java}、「Laravel」→ {php}、言語が読み取れなければ空集合。
 */
export function requiredLanguages(project: Project): Set<string> {
  return languagesOf(expandSkills(project.requiredSkills));
}

/** 人材が保有する「言語」の集合（包含展開後）。 */
export function talentLanguages(talent: Talent): Set<string> {
  return languagesOf(expandSkills([...talent.skills, ...talent.mainSkills]));
}

/**
 * 言語ゲート: 案件が要求する言語に対し、人材の言語が不一致なら true（＝除外すべき）。
 * - 案件から言語が読み取れない（requiredLangs が空）→ ゲートをかけない（false）。
 * - requireAll=false（既定・いずれか1つ）: 要求言語を1つも持たなければ除外。
 * - requireAll=true（すべて）: 要求言語のうち1つでも欠ければ除外。
 * 包含関係(Spring→java, Laravel→php)は保有として扱う。
 */
export function languageMismatch(
  project: Project,
  talent: Talent,
  requireAll = false,
): boolean {
  const req = requiredLanguages(project);
  if (req.size === 0) return false; // 言語要件が読み取れない → 絞らない
  const owned = talentLanguages(talent);
  if (requireAll) {
    for (const lang of req) if (!owned.has(lang)) return true; // 1つでも欠け → 除外
    return false;
  }
  for (const lang of req) if (owned.has(lang)) return false; // 1つでも合致 → OK
  return true; // 要求言語を1つも持たない → 除外
}

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
// 単価の許容超過マージン（万円）の既定値。組織設定(rateToleranceMan)で上書きされる。
// 人材の希望単価が「案件上限＋この値」を超えたら除外。自社/他社とも共通ルール。
export const DEFAULT_RATE_TOLERANCE_MAN = 5;
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

// ───────── 勤務地（地方区分）の判定 ─────────
// マッチ判定プロンプトと同じ7区分。都道府県名＋主要都市名から地方を推定する。
// 決定的（LLMに頼らない）。確信を持って判定できないテキストは null（＝不明）を返し、
// 呼び出し側は「不明は通す」方針で扱う（誤って候補を落とさない）。
export type Region =
  | "北海道" | "東北" | "関東" | "中部" | "近畿" | "中国四国" | "九州沖縄";

const REGION_KEYWORDS: Record<Region, string[]> = {
  北海道: ["北海道", "札幌"],
  東北: ["青森", "岩手", "宮城", "秋田", "山形", "福島", "仙台"],
  関東: ["東京", "神奈川", "埼玉", "千葉", "茨城", "栃木", "群馬", "横浜", "川崎", "さいたま", "首都圏", "都内", "23区"],
  中部: ["新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知", "名古屋", "浜松"],
  近畿: ["三重", "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山", "神戸", "梅田", "難波", "心斎橋"],
  中国四国: ["鳥取", "島根", "岡山", "広島", "山口", "徳島", "香川", "愛媛", "高知", "松山", "高松"],
  九州沖縄: ["福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄", "博多", "那覇"],
};

/**
 * テキストから地方区分を推定する。確信できないときは null。
 * - 1つの地方のキーワードだけがヒット → その地方。
 * - 複数の地方がヒット（例「東京／大阪」）や 0件 → null（曖昧・不明なので通す側）。
 */
export function regionOf(text: string | null | undefined): Region | null {
  if (!text) return null;
  // ヒットしたキーワードは消してから次の地方を調べる。これで「東京都」が関東にヒットした後、
  // 残り「都千代田区」から誤って「京都」(近畿)を拾う重なりを防ぐ（関東を近畿より先に走査）。
  let t = text.replace(/\s/g, "");
  const found = new Set<Region>();
  for (const [region, kws] of Object.entries(REGION_KEYWORDS) as [Region, string[]][]) {
    for (const k of kws) {
      if (t.includes(k)) {
        found.add(region);
        t = t.split(k).join(""); // 同一キーワードの重なり誤検知を防ぐため消す
      }
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

/**
 * 案件が「出社あり（＝勤務地が通勤圏である必要がある）」か。
 * フルリモート／基本リモートは地域不問→false。ハイブリッド・週N出社・常駐、または
 * 本文に「常駐／出社」の明示があれば true。判断材料が無ければ false（＝地域ゲートをかけない）。
 */
export function projectRequiresOnsite(project: Project): boolean {
  const pref = project.remotePreference;
  if (pref === "FULL_REMOTE" || pref === "MOSTLY_REMOTE") return false;
  if (
    pref === "HYBRID" ||
    pref === "ONSITE" ||
    pref === "OFFICE_1" ||
    pref === "OFFICE_2" ||
    pref === "OFFICE_3" ||
    pref === "OFFICE_4"
  ) {
    return true;
  }
  const t = `${project.location ?? ""}\n${project.description ?? ""}\n${project.channelText ?? ""}`;
  if (/フルリモート|完全リモート|フルリモ/.test(t)) return false;
  return /常駐|出社|来社|オンサイト/.test(t);
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
  rateToleranceMan: number = DEFAULT_RATE_TOLERANCE_MAN,
  languageMatchAll = false,
  opts?: {
    rateGate?: boolean;
    languageGate?: boolean;
    coverageGate?: boolean;
    minCoverage?: number;
  },
): PrefilterHit[] {
  const required = project.requiredSkills.map(normalize).filter(Boolean);
  const tol = Math.max(0, rateToleranceMan);
  const rateGate = opts?.rateGate ?? true;
  const languageGate = opts?.languageGate ?? true;
  const coverageGate = opts?.coverageGate ?? true;
  const minCoverage = opts?.minCoverage ?? MIN_COVERAGE;

  const hits: PrefilterHit[] = [];
  for (const talent of talents) {
    // 金額足切り（共通ルール・調整可）:
    //  人材の希望単価が「案件の想定単価上限 ＋ 許容超過マージン(tol万)」を超えたら除外。
    //  許容内（安い人材・案件上限をtol万まで超える人材）は通す。自社/他社とも同じ。
    //  ※他社人材で案件上限を超える＝逆ザヤ(薄利)になり得るが、許容範囲内なら通し、粗利は提案時に人が確認する。
    if (rateGate && project.rateMax != null && talent.desiredRateMin != null) {
      if (talent.desiredRateMin > project.rateMax + tol) continue;
    }

    // 言語ゲート（最優先の必須）: 案件の要求言語を1つも持たない人材は除外（Java案件×PHPのみ 等）。
    // 言語が読み取れない案件・要求言語のいずれかを保有する人材は通す。包含(Spring→java)は保有扱い。
    if (languageGate && languageMismatch(project, talent, languageMatchAll)) continue;

    const owned = expandSkills([...talent.skills, ...talent.mainSkills]);

    if (required.length === 0) {
      // 必須スキル未指定 → スキルで絞れないのでLLM判定に委ねる（金額足切りは適用済み）。
      hits.push({ talent, coreHits: 0, coverage: 0 });
      continue;
    }
    const coreHits = required.filter((r) => owned.has(r)).length;
    const coverage = coreHits / required.length;
    // 言語/スキルを厳しく: カバー率が閾値未満なら除外（ゲートOFF時は全件通してLLM/他ゲートに委ねる）。
    if (!coverageGate || coverage >= minCoverage) {
      hits.push({ talent, coreHits, coverage });
    }
  }

  hits.sort((a, b) => b.coverage - a.coverage || b.coreHits - a.coreHits);
  return hits.slice(0, limit);
}
