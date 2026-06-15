import { describe, it, expect } from "vitest";
import { groupByTalent } from "./group";
import type { MatchVM } from "../matches-list";

let seq = 0;
function mk(p: {
  talentName: string;
  mainSkills?: string[];
  talentReceived?: string;
  projectTitle: string;
  clientName?: string | null;
  projectReceived?: string;
  score: number;
  proposable?: boolean;
}): MatchVM {
  seq += 1;
  return {
    id: `m${seq}`,
    score: p.score,
    reasons: [],
    proposable: p.proposable ?? true,
    channelNote: null,
    locationOk: null,
    sentInfoAt: null,
    talent: {
      id: `t-${p.talentName}`,
      name: p.talentName,
      talentType: "INHOUSE",
      affiliation: null,
      mainSkills: p.mainSkills ?? [],
      skills: [],
      desiredRateMin: null,
      desiredRateMax: null,
      remotePreference: null,
      receivedDate: p.talentReceived ?? null,
    },
    project: {
      id: `p-${p.projectTitle}`,
      title: p.projectTitle,
      clientName: p.clientName ?? null,
      rateMin: null,
      rateMax: null,
      requiredSkills: [],
      receivedDate: p.projectReceived ?? null,
      channelText: null,
      supportFee: false,
    },
  } as MatchVM;
}

describe("groupByTalent — 自社マッチの人材起点グループ化", () => {
  it("同一人材の複数案件を1グループにまとめ、案件は点数降順", () => {
    const groups = groupByTalent([
      mk({ talentName: "田中", projectTitle: "案件A", score: 75 }),
      mk({ talentName: "田中", projectTitle: "案件B", score: 90 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].talent.name).toBe("田中");
    expect(groups[0].rows.map((r) => r.m.project.title)).toEqual(["案件B", "案件A"]);
  });

  it("人材は最高スコア順に並ぶ", () => {
    const groups = groupByTalent([
      mk({ talentName: "低", projectTitle: "X", score: 72 }),
      mk({ talentName: "高", projectTitle: "Y", score: 95 }),
    ]);
    expect(groups.map((g) => g.talent.name)).toEqual(["高", "低"]);
  });

  it("同一案件の重複は最高スコアを代表にし dupes を数える", () => {
    const groups = groupByTalent([
      mk({ talentName: "佐藤", projectTitle: "重複案件", clientName: "C社", score: 70 }),
      mk({ talentName: "佐藤", projectTitle: "重複案件", clientName: "C社", score: 88 }),
    ]);
    expect(groups[0].rows).toHaveLength(1);
    expect(groups[0].rows[0].dupes).toBe(2);
    expect(groups[0].rows[0].m.score).toBe(88);
  });

  it("同名・同スキルの人材は名寄せされ、代表は最新配信", () => {
    const groups = groupByTalent([
      mk({
        talentName: "山田",
        mainSkills: ["Java"],
        talentReceived: "2026-06-01T00:00:00.000Z",
        projectTitle: "旧",
        score: 80,
      }),
      mk({
        talentName: "山田",
        mainSkills: ["Java"],
        talentReceived: "2026-06-08T00:00:00.000Z",
        projectTitle: "新",
        score: 85,
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].talent.receivedDate).toBe("2026-06-08T00:00:00.000Z");
  });
});
