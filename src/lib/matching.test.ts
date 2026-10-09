import { describe, it, expect } from "vitest";
import type { Talent, Project } from "@prisma/client";
import {
  scoreMatch,
  expandSkills,
  companyDomain,
  isSameCompany,
  prefilterCandidates,
  isStrictDirectChannel,
  channelDepth,
  dedupeProjectsForMatch,
  regionOf,
  projectRequiresOnsite,
  requiredLanguages,
  languageMismatch,
} from "./matching";

function talent(p: Partial<Talent>): Talent {
  return { skills: [], mainSkills: [], ...p } as unknown as Talent;
}
function project(p: Partial<Project>): Project {
  return { requiredSkills: [], ...p } as unknown as Project;
}

describe("requiredLanguages / languageMismatch", () => {
  it("案件の要求言語を抽出（包含でSpringBoot→java, Laravel→php）", () => {
    expect([...requiredLanguages(project({ requiredSkills: ["Java", "AWS"] }))]).toEqual(["java"]);
    expect([...requiredLanguages(project({ requiredSkills: ["Spring Boot", "MySQL"] }))]).toContain("java");
    expect([...requiredLanguages(project({ requiredSkills: ["Laravel"] }))]).toContain("php");
    // 言語が無い案件（FW/DB/クラウドのみ）→ 空
    expect(requiredLanguages(project({ requiredSkills: ["AWS", "Docker"] })).size).toBe(0);
  });

  it("要求言語を1つも持たない人材は除外（Java案件×PHPのみ）", () => {
    const p = project({ requiredSkills: ["Java"] });
    expect(languageMismatch(p, talent({ skills: ["PHP", "Laravel"] }))).toBe(true); // 除外
    expect(languageMismatch(p, talent({ skills: ["Java"] }))).toBe(false); // 通す
    expect(languageMismatch(p, talent({ skills: ["Spring Boot"] }))).toBe(false); // 包含で保有
  });

  it("複数言語案件は『いずれか1つ』持てば通す（既定・ANY）", () => {
    const p = project({ requiredSkills: ["Java", "Python"] });
    expect(languageMismatch(p, talent({ skills: ["Java"] }))).toBe(false); // 1つ合致 → 通す
    expect(languageMismatch(p, talent({ skills: ["PHP"] }))).toBe(true); // 0合致 → 除外
  });

  it("ALLモードは要求言語を全部持たないと除外", () => {
    const p = project({ requiredSkills: ["Java", "Python"] });
    expect(languageMismatch(p, talent({ skills: ["Java"] }), true)).toBe(true); // Python欠 → 除外
    expect(languageMismatch(p, talent({ skills: ["Java", "Python"] }), true)).toBe(false); // 両方 → 通す
    expect(languageMismatch(p, talent({ skills: ["Spring Boot", "Django"] }), true)).toBe(false); // 包含で両方
  });

  it("言語が読み取れない案件は言語ゲートをかけない", () => {
    const p = project({ requiredSkills: ["AWS", "Docker"] });
    expect(languageMismatch(p, talent({ skills: ["PHP"] }))).toBe(false);
  });
});

describe("regionOf", () => {
  it("都道府県・主要都市名から地方を判定", () => {
    expect(regionOf("東京都千代田区")).toBe("関東");
    expect(regionOf("大阪市北区")).toBe("近畿");
    expect(regionOf("最寄: 梅田")).toBe("近畿");
    expect(regionOf("名古屋")).toBe("中部");
    expect(regionOf("福岡県")).toBe("九州沖縄");
  });
  it("地名が無い・曖昧（複数地方）は null（＝不明で通す側）", () => {
    expect(regionOf("最寄: 新宿駅")).toBeNull(); // 駅名のみ
    expect(regionOf(null)).toBeNull();
    expect(regionOf("東京/大阪どちらも可")).toBeNull(); // 複数ヒット→曖昧
  });
});

describe("projectRequiresOnsite", () => {
  it("フルリモート・基本リモートは false", () => {
    expect(projectRequiresOnsite(project({ remotePreference: "FULL_REMOTE" }))).toBe(false);
    expect(projectRequiresOnsite(project({ remotePreference: "MOSTLY_REMOTE" }))).toBe(false);
  });
  it("常駐・出社系は true", () => {
    expect(projectRequiresOnsite(project({ remotePreference: "ONSITE" }))).toBe(true);
    expect(projectRequiresOnsite(project({ remotePreference: "HYBRID" }))).toBe(true);
    expect(projectRequiresOnsite(project({ description: "東京で常駐" }))).toBe(true);
  });
  it("リモート指定なし・本文に手掛かり無しは false（地域ゲートをかけない）", () => {
    expect(projectRequiresOnsite(project({ description: "Java開発" }))).toBe(false);
  });
});

describe("scoreMatch", () => {
  it("全条件が合致すると高スコア", () => {
    const { score } = scoreMatch(
      talent({
        skills: ["Java"],
        mainSkills: ["Java"],
        desiredRateMin: 80,
        remotePreference: "ONSITE",
        availabilityText: "即日",
      }),
      project({
        requiredSkills: ["Java"],
        rateMax: 100,
        remotePreference: "MOSTLY_REMOTE",
      }),
    );
    // skills60 + rate20 + remote10 + avail10 = 100
    expect(score).toBe(100);
  });

  it("必須スキルが一致しないとスキル点(60)が入らない", () => {
    const full = scoreMatch(
      talent({ skills: ["Java"] }),
      project({ requiredSkills: ["Java"] }),
    ).score;
    const none = scoreMatch(
      talent({ skills: ["Java"] }),
      project({ requiredSkills: ["PHP"] }),
    ).score;
    expect(full - none).toBe(60);
  });

  it("希望単価が案件上限を超えると単価点が入らず理由に記録", () => {
    const { score, reasons } = scoreMatch(
      talent({ skills: ["Java"], desiredRateMin: 120 }),
      project({ requiredSkills: ["Java"], rateMax: 100 }),
    );
    expect(reasons.some((r) => r.includes("単価超過"))).toBe(true);
    // skills60 + rate0 + remote5 + avail0 = 65
    expect(score).toBe(65);
  });

  it("スコアは0〜100に収まる", () => {
    const { score } = scoreMatch(talent({}), project({}));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("expandSkills", () => {
  it("Spring Boot は java/spring を含意する", () => {
    const owned = expandSkills(["Spring Boot"]);
    expect(owned.has("java")).toBe(true);
    expect(owned.has("spring")).toBe(true);
    expect(owned.has("spring boot")).toBe(true);
  });

  it("無関係な言語は含意しない", () => {
    const owned = expandSkills(["Java"]);
    expect(owned.has("php")).toBe(false);
  });
});

describe("companyDomain / isSameCompany", () => {
  it("会社ドメインを抽出、フリーメールは null", () => {
    expect(companyDomain("a@obfall.co.jp")).toBe("obfall.co.jp");
    expect(companyDomain("a@gmail.com")).toBeNull();
    expect(companyDomain(null)).toBeNull();
  });

  it("同一会社ドメインなら true、フリーメール同士は false", () => {
    expect(
      isSameCompany(
        { sourceEmail: "x@acme.co.jp" },
        { sourceEmail: "y@acme.co.jp" },
      ),
    ).toBe(true);
    expect(
      isSameCompany(
        { sourceEmail: "x@gmail.com" },
        { sourceEmail: "y@gmail.com" },
      ),
    ).toBe(false);
  });
});

describe("prefilterCandidates", () => {
  it("必須スキルを満たす候補のみ残しカバー率順に並べる", () => {
    const p = project({ requiredSkills: ["PHP", "Laravel"] });
    const phpFull = talent({ id: "a", skills: ["PHP", "Laravel"] } as Partial<Talent>);
    const phpPartial = talent({ id: "b", skills: ["PHP"] } as Partial<Talent>); // 1/2=0.5 ≥0.5 通る
    const javaOnly = talent({ id: "c", skills: ["Java"] } as Partial<Talent>);

    const hits = prefilterCandidates(p, [javaOnly, phpPartial, phpFull]);
    const ids = hits.map((h) => h.talent.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).not.toContain("c"); // Javaのみは除外
    expect(ids[0]).toBe("a"); // カバー率100%が先頭
  });

  it("limit で件数を絞る", () => {
    const p = project({ requiredSkills: ["js"] });
    const many = Array.from({ length: 10 }, (_, i) =>
      talent({ id: String(i), skills: ["JS"] } as Partial<Talent>),
    );
    expect(prefilterCandidates(p, many, 3)).toHaveLength(3);
  });

  it("金額足切り: 希望が『案件上限＋許容』を超えると除外（安い人材・許容内は通す）", () => {
    const p = project({ requiredSkills: ["Java"], rateMax: 100 });
    const cheap = talent({ id: "cheap", skills: ["Java"], desiredRateMin: 80 } as Partial<Talent>); // 安い → 残す
    const atCap = talent({ id: "atCap", skills: ["Java"], desiredRateMin: 100 } as Partial<Talent>); // 上限ちょうど → 許容内で残す
    const within = talent({ id: "within", skills: ["Java"], desiredRateMin: 105 } as Partial<Talent>); // +5万=許容内 → 残す
    const over = talent({ id: "over", skills: ["Java"], desiredRateMin: 106 } as Partial<Talent>); // +6万=許容超過 → 除外
    // 許容5万で判定。
    const ids = prefilterCandidates(p, [cheap, atCap, within, over], 30, 5).map((h) => h.talent.id);
    expect(ids).toContain("cheap");
    expect(ids).toContain("atCap");
    expect(ids).toContain("within");
    expect(ids).not.toContain("over");
  });

  it("金額足切り: 許容0なら案件上限を1円でも超えたら除外", () => {
    const p = project({ requiredSkills: ["Java"], rateMax: 100 });
    const atCap = talent({ id: "atCap", skills: ["Java"], desiredRateMin: 100 } as Partial<Talent>); // 上限ちょうど → 残す
    const over = talent({ id: "over", skills: ["Java"], desiredRateMin: 101 } as Partial<Talent>); // 超過 → 除外
    const ids = prefilterCandidates(p, [atCap, over], 30, 0).map((h) => h.talent.id);
    expect(ids).toContain("atCap");
    expect(ids).not.toContain("over");
  });

  it("カバー率0.5未満は除外（3スキル中1つは落ちる・2つは通る）", () => {
    const p = project({ requiredSkills: ["Java", "Spring", "AWS"] });
    const one = talent({ id: "one", skills: ["Java"] } as Partial<Talent>); // 1/3 ≈ 0.33
    const two = talent({ id: "two", skills: ["Java", "AWS"] } as Partial<Talent>); // 2/3 ≈ 0.67
    const ids = prefilterCandidates(p, [one, two]).map((h) => h.talent.id);
    expect(ids).toContain("two");
    expect(ids).not.toContain("one");
  });
});

describe("channelDepth", () => {
  it("エンド直/プロパー=0、N社先=N、不明=99", () => {
    expect(channelDepth("エンド直のみ")).toBe(0);
    expect(channelDepth("プロパー")).toBe(0);
    expect(channelDepth("1社先まで")).toBe(1);
    expect(channelDepth("二社先")).toBe(2);
    expect(channelDepth(null)).toBe(99);
  });
});

describe("dedupeProjectsForMatch", () => {
  it("同じ会社×件名は重複→単価が高い方を採用", () => {
    const a = project({ id: "a", sourceEmail: "x@acme.co.jp", emailSubject: "Java案件", rateMax: 80 } as Partial<Project>);
    const b = project({ id: "b", sourceEmail: "y@acme.co.jp", emailSubject: "Re: Java案件", rateMax: 100 } as Partial<Project>);
    const out = dedupeProjectsForMatch([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b"); // 単価高い & Re: は同一件名扱い
  });

  it("単価同じなら商流が浅い方を採用", () => {
    const a = project({ id: "a", sourceEmail: "x@acme.co.jp", emailSubject: "S", rateMax: 80, channelText: "2社先" } as Partial<Project>);
    const b = project({ id: "b", sourceEmail: "y@acme.co.jp", emailSubject: "S", rateMax: 80, channelText: "エンド直" } as Partial<Project>);
    const out = dedupeProjectsForMatch([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b"); // 商流浅い
  });

  it("会社が違えば同じ件名でも別案件（名寄せしない）", () => {
    const a = project({ id: "a", sourceEmail: "x@acme.co.jp", emailSubject: "S", rateMax: 80 } as Partial<Project>);
    const b = project({ id: "b", sourceEmail: "y@other.co.jp", emailSubject: "S", rateMax: 100 } as Partial<Project>);
    expect(dedupeProjectsForMatch([a, b])).toHaveLength(2);
  });

  it("会社不明(フリーメール/なし)は名寄せしない", () => {
    const a = project({ id: "a", sourceEmail: null, emailSubject: "S" } as Partial<Project>);
    const b = project({ id: "b", sourceEmail: "z@gmail.com", emailSubject: "S" } as Partial<Project>);
    expect(dedupeProjectsForMatch([a, b])).toHaveLength(2);
  });
});

describe("isStrictDirectChannel", () => {
  it("エンド直/プロパー/直のみ を厳格商流と判定", () => {
    expect(isStrictDirectChannel("エンド直のみ")).toBe(true);
    expect(isStrictDirectChannel("プロパー〜1社先")).toBe(true);
    expect(isStrictDirectChannel("直のみ")).toBe(true);
  });
  it("1社先まで等は厳格ではない・null安全", () => {
    expect(isStrictDirectChannel("1社先まで")).toBe(false);
    expect(isStrictDirectChannel(null)).toBe(false);
  });
});
