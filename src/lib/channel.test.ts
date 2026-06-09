import { describe, it, expect } from "vitest";
import { channelStatus, inhouseChannelStatus } from "./channel";

describe("channelStatus（通常）", () => {
  it("提案不可 → 赤", () => {
    expect(channelStatus(false, null)?.tone).toBe("red");
    expect(channelStatus(false, "エンド直のみ")?.tone).toBe("red");
  });
  it("提案可で要確認/不明 → 黄", () => {
    expect(channelStatus(true, "所属不明のため要確認")?.tone).toBe("amber");
  });
  it("提案可で根拠あり → 緑", () => {
    expect(channelStatus(true, "1社先まで範囲内")?.tone).toBe("green");
  });
  it("提案可で根拠なし → バッジなし(null)", () => {
    expect(channelStatus(true, null)).toBeNull();
  });
});

describe("inhouseChannelStatus（自社向け）", () => {
  it("提案可で根拠なしでも 緑「商流OK」を出す", () => {
    const cs = inhouseChannelStatus(true, null);
    expect(cs?.tone).toBe("green");
    expect(cs?.label).toBe("商流OK");
  });
  it("提案不可は通常どおり 赤", () => {
    expect(inhouseChannelStatus(false, null)?.tone).toBe("red");
  });
  it("要確認は通常どおり 黄", () => {
    expect(inhouseChannelStatus(true, "要確認")?.tone).toBe("amber");
  });
});
