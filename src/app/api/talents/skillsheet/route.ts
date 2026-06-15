import { NextRequest, NextResponse } from "next/server";
import { getAI } from "@/lib/ai";
import type { EmailAttachment } from "@/lib/ai";
import { getCurrentOrg } from "@/lib/current-org";
import { extractOfficeText } from "@/lib/office";

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
    const org = await getCurrentOrg();

    if (body.action === "improve") {
      const text = (body.text ?? "").trim();
      if (!text) {
        return NextResponse.json({ error: "text is required" }, { status: 400 });
      }
      const summary = await ai.improveSkillSheet(
        text,
        org.skillSheetImprovePrompt ?? undefined,
      );
      return NextResponse.json({ summary });
    }

    // default: generate（ファイル or テキストからサマリ＋構造化情報を生成）
    let text = (body.text ?? "").trim();
    const rawAttachments = body.attachments ?? [];
    if (!text && rawAttachments.length === 0) {
      return NextResponse.json(
        { error: "テキストかファイルが必要です" },
        { status: 400 },
      );
    }

    // PDFはClaudeが直接読めるので添付のまま。Excel/Word(.xlsx/.xls/.docx)は
    // Claudeが読めないので、ここでサーバ側でテキスト抽出して本文に合流させる。
    const pdfAttachments: EmailAttachment[] = [];
    for (const a of rawAttachments) {
      if (a.mediaType === "application/pdf" || /\.pdf$/i.test(a.filename)) {
        pdfAttachments.push(a);
        continue;
      }
      const extracted = await extractOfficeText(a.filename, a.dataBase64);
      if (extracted) text = (text ? `${text}\n\n` : "") + extracted;
    }

    if (!text && pdfAttachments.length === 0) {
      return NextResponse.json(
        {
          error:
            "このファイルからテキストを読み取れませんでした。PDF・Excel(.xlsx/.xls)・Word(.docx)・テキストでお試しください（旧形式の .doc は非対応です）。",
        },
        { status: 422 },
      );
    }

    const result = await ai.parseSkillSheet(
      text || "（添付ファイルを参照）",
      pdfAttachments,
      org.skillSheetPrompt ?? undefined,
    );
    const { summary, ...talent } = result;
    return NextResponse.json({ summary, talent });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
