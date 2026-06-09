import { describe, it, expect } from "vitest";
import { MockAIService } from "./mock";
import type { MatchProjectInput, MatchCandidateInput } from "./types";

const ai = new MockAIService();

function proj(p: Partial<MatchProjectInput>): MatchProjectInput {
  return { title: "案件", requiredSkills: [], ...p };
}
function cand(p: Partial<MatchCandidateInput>): MatchCandidateInput {
  return { talentId: "t1", name: "T", skills: [], ...p };
}

describe("MockAIService.rankCandidates — 商流判定", () => {
  it("エンド直のみ＋支援費なし → 提案不可(channelOk=false)", async () => {
    const [r] = await ai.rankCandidates(
      proj({ requiredSkills: ["PHP"], channelText: "エンド直のみ", supportFee: false }),
      [cand({ skills: ["PHP"] })],
    );
    expect(r.channelOk).toBe(false);
    expect(r.channelNote).toContain("提案不可");
  });

  it("支援費の記載あり → 提案可(channelOk=true)", async () => {
    const [r] = await ai.rankCandidates(
      proj({ requiredSkills: ["PHP"], channelText: "エンド直のみ", supportFee: true }),
      [cand({ skills: ["PHP"] })],
    );
    expect(r.channelOk).toBe(true);
    expect(r.channelNote).toContain("支援費");
  });

  it("1社先まで（厳格でない）→ 提案可", async () => {
    const [r] = await ai.rankCandidates(
      proj({ requiredSkills: ["PHP"], channelText: "1社先まで", supportFee: false }),
      [cand({ skills: ["PHP"] })],
    );
    expect(r.channelOk).toBe(true);
  });
});

describe("MockAIService.rankCandidates — スコアリング", () => {
  it("必須スキル一致は高スコア・不一致は UNFIT", async () => {
    const results = await ai.rankCandidates(proj({ requiredSkills: ["PHP"] }), [
      cand({ talentId: "php", skills: ["PHP", "Laravel"] }),
      cand({ talentId: "java", skills: ["Java"] }),
    ]);
    const php = results.find((r) => r.talentId === "php")!;
    const java = results.find((r) => r.talentId === "java")!;
    expect(php.score).toBeGreaterThanOrEqual(50);
    expect(java.recommendation).toBe("UNFIT");
    // スコア降順で返る
    expect(results[0].talentId).toBe("php");
  });
});

describe("MockAIService.parseTalentEmail — 所属/性別の抽出", () => {
  it("【所属】（全角空白あり）から所属を抽出", async () => {
    const t = await ai.parseTalentEmail("【 所属 】 一社先フリーランス\n年齢 32歳");
    expect(t.affiliation).toBe("一社先フリーランス");
  });

  it("【商流】ラベルからも所属として抽出", async () => {
    const t = await ai.parseTalentEmail("【商流】自社所属フリーランス");
    expect(t.affiliation).toBe("自社所属フリーランス");
  });

  it("性別を MALE/FEMALE に変換", async () => {
    expect((await ai.parseTalentEmail("【性別】男性")).gender).toBe("MALE");
    expect((await ai.parseTalentEmail("性別: 女")).gender).toBe("FEMALE");
  });
});

describe("MockAIService.parseSkillSheet / improveSkillSheet", () => {
  it("サマリ文をテンプレ形式で生成し、構造化スキルも返す", async () => {
    const res = await ai.parseSkillSheet(
      "氏名: 山田太郎\nスキル PHP Laravel\n希望単価 80万",
    );
    expect(res.summary).toContain("【ID】");
    expect(res.summary).toContain("【経験スキル】");
    expect(res.skills).toContain("PHP");
  });

  it("improveSkillSheet は連続空行と末尾空白を整える", async () => {
    const out = await ai.improveSkillSheet("a   \n\n\n\nb   ");
    expect(out).toBe("a\n\nb");
  });
});
