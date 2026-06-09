import { describe, it, expect } from "vitest";
import type { Talent, Project } from "@prisma/client";
import {
  scoreMatch,
  expandSkills,
  companyDomain,
  isSameCompany,
  prefilterCandidates,
} from "./matching";

function talent(p: Partial<Talent>): Talent {
  return { skills: [], mainSkills: [], ...p } as unknown as Talent;
}
function project(p: Partial<Project>): Project {
  return { requiredSkills: [], ...p } as unknown as Project;
}

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
    const phpPartial = talent({ id: "b", skills: ["PHP"] } as Partial<Talent>);
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
});
