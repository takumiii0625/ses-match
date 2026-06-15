// 人材1名を「要員情報ブロック（メール本文に載せる体裁）」に整形する共通関数。
// 提案メール(send-talent)・一斉案内(blast)で同じ整形を使う。

export interface TalentBlockInput {
  name: string;
  emailBody?: string | null;
  summaryText?: string | null;
  mainSkills?: string[];
  skills?: string[];
  desiredRateMin?: number | null;
  desiredRateMax?: number | null;
  availabilityText?: string | null;
}

/**
 * 要員情報の優先順位: 人材メール本文 → スキルシート要約 → 構造化項目から組み立て。
 * （既存の提案メール send-talent と同じ優先順位。一斉案内でも共通利用する。）
 */
export function buildTalentBlock(t: TalentBlockInput): string {
  const body = t.emailBody?.trim();
  if (body) return body;
  const summary = t.summaryText?.trim();
  if (summary) return summary;
  const skills = (t.mainSkills?.length ? t.mainSkills : t.skills) ?? [];
  return [
    `【氏名】${t.name}`,
    `【スキル】${skills.join(" / ") || "-"}`,
    `【希望単価】${t.desiredRateMin ?? "-"}〜${t.desiredRateMax ?? "-"}万`,
    `【稼働開始】${t.availabilityText ?? "-"}`,
  ].join("\n");
}

/**
 * 一斉案内（複数人を1通で紹介）用の、人材1名ぶんのブロック。
 * 必ず氏名見出しを先頭に置き、本人固有の情報だけで構成する。
 * emailBody（元メール本文）は使わない＝複数人をまとめた1通から登録された人材でも
 * 「別の人の内容」が混ざらないようにする。summaryText（スキルシート要約）があれば使う。
 */
export function buildTalentIntroBlock(t: TalentBlockInput): string {
  const skills = (t.mainSkills?.length ? t.mainSkills : t.skills) ?? [];
  const head = `■ ${t.name}`;
  const summary = t.summaryText?.trim();
  if (summary) return `${head}\n${summary}`;
  return [
    head,
    `スキル：${skills.join(" / ") || "-"}`,
    `希望単価：${t.desiredRateMin ?? "-"}〜${t.desiredRateMax ?? "-"}万`,
    `稼働開始：${t.availabilityText ?? "-"}`,
  ].join("\n");
}

/** 複数人材を区切り線で連結（一斉案内の人材一覧用）。 */
export function joinTalentBlocks(blocks: string[]): string {
  const sep = "\n────────────────────\n";
  return blocks.map((b) => b.trim()).filter(Boolean).join(sep);
}
