import { NextRequest, NextResponse } from "next/server";
import { getAI } from "@/lib/ai";
import type { EmailAttachment } from "@/lib/ai";

// AIでの解析を含むため長め。
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: "generate" | "improve";
      text?: string;
      attachments?: EmailAttachment[];
    };
    const ai = getAI();

    if (body.action === "improve") {
      const text = (body.text ?? "").trim();
      if (!text) {
        return NextResponse.json({ error: "text is required" }, { status: 400 });
      }
      const summary = await ai.improveSkillSheet(text);
      return NextResponse.json({ summary });
    }

    // default: generate（ファイル or テキストからサマリ＋構造化情報を生成）
    const text = (body.text ?? "").trim();
    const attachments = body.attachments ?? [];
    if (!text && attachments.length === 0) {
      return NextResponse.json(
        { error: "テキストかファイルが必要です" },
        { status: 400 },
      );
    }
    const result = await ai.parseSkillSheet(text || "（添付ファイルを参照）", attachments);
    const { summary, ...talent } = result;
    return NextResponse.json({ summary, talent });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
