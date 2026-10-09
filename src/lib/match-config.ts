// マッチの設定（マッチング画面の「マッチ設定」パネルで編集・保存）。
// Organization.matchConfig(JSON) に保存し、マッチ処理(match-run)で参照する。
// rateToleranceMan / languageMatchAll は従来どおり専用カラムに持つ（この型には含めない）。

export type Emphasis = "high" | "normal" | "low";

/** 除外ゲートのON/OFF。false にすると「除外に使わない（点数で見るだけ）」になる。 */
export interface GateToggles {
  channel: boolean; // 商流・契約形態
  language: boolean; // 必須言語
  rate: boolean; // 単価（案件上限＋許容の超過）
  location: boolean; // 勤務地（出社あり×地方不一致）
  nationality: boolean; // 国籍（日本人のみ案件×外国籍）
  coverage: boolean; // スキルのカバー率（必須スキルの充足割合）
}

/** 点数要素の比重（LLMスコアへの反映。プロンプトに注入）。 */
export interface Weights {
  skills: Emphasis; // 必須スキルの充足
  rate: Emphasis; // 単価の整合
  availability: Emphasis; // 稼働開始時期
  remote: Emphasis; // リモート/出社条件
  experience: Emphasis; // 経験年数・担当役割・語学
  ageNationality: Emphasis; // 年齢・国籍
}

/** 独自の判定ルール（自由記述）。exclude=true は「該当したら除外」、false は「点数に反映」。 */
export interface CustomRule {
  text: string;
  exclude: boolean;
}

export interface MatchConfig {
  gates: GateToggles;
  minCoverage: number; // 0〜1。カバー率ゲートの閾値。
  weights: Weights;
  customRules: CustomRule[];
}

export const DEFAULT_MIN_COVERAGE = 0.5;

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  gates: {
    channel: true,
    language: true,
    rate: true,
    location: true,
    nationality: true,
    coverage: true,
  },
  minCoverage: DEFAULT_MIN_COVERAGE,
  weights: {
    skills: "normal",
    rate: "normal",
    availability: "normal",
    remote: "normal",
    experience: "normal",
    ageNationality: "normal",
  },
  customRules: [],
};

const EMPHASIS = new Set<Emphasis>(["high", "normal", "low"]);
function emphasis(v: unknown, fallback: Emphasis): Emphasis {
  return typeof v === "string" && EMPHASIS.has(v as Emphasis) ? (v as Emphasis) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** 保存値(JSON)を既定値にマージして安全な MatchConfig にする。未知/欠損は既定で補完。 */
export function parseMatchConfig(raw: unknown): MatchConfig {
  const d = DEFAULT_MATCH_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const g = (o.gates ?? {}) as Record<string, unknown>;
  const w = (o.weights ?? {}) as Record<string, unknown>;
  const minCovRaw = Number(o.minCoverage);
  const minCoverage =
    Number.isFinite(minCovRaw) && minCovRaw >= 0 && minCovRaw <= 1 ? minCovRaw : d.minCoverage;
  const rules = Array.isArray(o.customRules)
    ? (o.customRules as unknown[])
        .map((r) => {
          const rr = (r ?? {}) as Record<string, unknown>;
          return { text: typeof rr.text === "string" ? rr.text.trim() : "", exclude: bool(rr.exclude, false) };
        })
        .filter((r) => r.text)
        .slice(0, 20)
    : [];
  return {
    gates: {
      channel: bool(g.channel, d.gates.channel),
      language: bool(g.language, d.gates.language),
      rate: bool(g.rate, d.gates.rate),
      location: bool(g.location, d.gates.location),
      nationality: bool(g.nationality, d.gates.nationality),
      coverage: bool(g.coverage, d.gates.coverage),
    },
    minCoverage,
    weights: {
      skills: emphasis(w.skills, d.weights.skills),
      rate: emphasis(w.rate, d.weights.rate),
      availability: emphasis(w.availability, d.weights.availability),
      remote: emphasis(w.remote, d.weights.remote),
      experience: emphasis(w.experience, d.weights.experience),
      ageNationality: emphasis(w.ageNationality, d.weights.ageNationality),
    },
    customRules: rules,
  };
}

const EMPHASIS_LABEL: Record<Emphasis, string> = {
  high: "重視（大きく加点/減点）",
  normal: "標準",
  low: "軽視（影響は小さめ）",
};
const WEIGHT_LABEL: Record<keyof Weights, string> = {
  skills: "必須スキルの充足",
  rate: "単価の整合",
  availability: "稼働開始時期",
  remote: "リモート/出社条件",
  experience: "経験年数・担当役割・語学",
  ageNationality: "年齢・国籍",
};

/**
 * 比重(C)と独自ルール(D)を、LLMマッチ判定プロンプトへ追記する文面に変換する。
 * 既定（全て標準・ルール無し）のときは空文字（プロンプトを変えない＝キャッシュを効かせる）。
 */
export function matchConfigPromptAddon(config: MatchConfig): string {
  const parts: string[] = [];
  const nonDefault = (Object.keys(config.weights) as (keyof Weights)[]).filter(
    (k) => config.weights[k] !== "normal",
  );
  if (nonDefault.length > 0) {
    const lines = nonDefault.map((k) => `- ${WEIGHT_LABEL[k]}: ${EMPHASIS_LABEL[config.weights[k]]}`);
    parts.push(`【評価の比重】次の比重で score を付ける（他は標準）:\n${lines.join("\n")}`);
  }
  if (config.customRules.length > 0) {
    const excludes = config.customRules.filter((r) => r.exclude).map((r) => `- ${r.text}`);
    const scores = config.customRules.filter((r) => !r.exclude).map((r) => `- ${r.text}`);
    if (excludes.length > 0) {
      parts.push(
        `【追加の除外ルール（以下に明確に該当する人材は提案不可とみなし、score を MIN_SCORE 未満まで下げて除外する。曖昧なものは通常判定）】\n${excludes.join("\n")}`,
      );
    }
    if (scores.length > 0) {
      parts.push(`【追加の評価観点（score に反映する。除外はしない）】\n${scores.join("\n")}`);
    }
  }
  return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
}
