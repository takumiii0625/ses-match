import type { MatchVM } from "../matches-list";
import { talentDedupeKey, projectDedupeKey } from "@/lib/dedupe";

export interface InhouseGroup {
  talent: MatchVM["talent"];
  rows: { m: MatchVM; dupes: number }[];
}

/**
 * 自社マッチを人材起点でグループ化する。
 * - 人材は氏名+主要スキルで名寄せし、最新配信を代表に。
 * - 同一人材の中で案件はタイトル+クライアントで名寄せし、最高スコアを代表に（重複数を保持）。
 * - 人材は最高スコア順、各人材の案件も点数降順。
 */
export function groupByTalent(matches: MatchVM[]): InhouseGroup[] {
  const rep = new Map<string, { talent: MatchVM["talent"]; ms: number }>();
  for (const m of matches) {
    const k = talentDedupeKey(m.talent.name, m.talent.mainSkills);
    const ms = m.talent.receivedDate ? Date.parse(m.talent.receivedDate) : 0;
    const cur = rep.get(k);
    if (!cur || ms > cur.ms) rep.set(k, { talent: m.talent, ms });
  }

  const byKey = new Map<
    string,
    { talent: MatchVM["talent"]; projects: Map<string, { m: MatchVM; dupes: number }> }
  >();
  for (const m of matches) {
    const tk = talentDedupeKey(m.talent.name, m.talent.mainSkills);
    let g = byKey.get(tk);
    if (!g) {
      g = { talent: rep.get(tk)!.talent, projects: new Map() };
      byKey.set(tk, g);
    }
    const pk = projectDedupeKey(m.project.title, m.project.clientName);
    const cur = g.projects.get(pk);
    if (!cur) g.projects.set(pk, { m, dupes: 1 });
    else {
      cur.dupes++;
      if (m.score > cur.m.score) cur.m = m; // 同一案件は最高スコアを代表に
    }
  }

  return [...byKey.values()]
    .map((g) => ({
      talent: g.talent,
      rows: [...g.projects.values()]
        .map((x) => ({ m: x.m, dupes: x.dupes }))
        .sort((a, b) => b.m.score - a.m.score),
    }))
    .sort((a, b) => (b.rows[0]?.m.score ?? 0) - (a.rows[0]?.m.score ?? 0));
}
