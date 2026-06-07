import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { PROMPT_FIELDS } from "@/lib/ai/prompts";

const VALID_AI_PROVIDERS = ["mock", "anthropic", "openai"] as const;
type AiProvider = (typeof VALID_AI_PROVIDERS)[number];

function isValidAiProvider(v: unknown): v is AiProvider {
  return typeof v === "string" && (VALID_AI_PROVIDERS as readonly string[]).includes(v);
}

export async function GET() {
  try {
    const org = await getCurrentOrg();
    return NextResponse.json({ org });
  } catch (err) {
    console.error("[GET /api/settings]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const body = (await req.json()) as Record<string, unknown>;

    // Validate aiProvider if provided
    if (body.aiProvider !== undefined && !isValidAiProvider(body.aiProvider)) {
      return NextResponse.json(
        { error: `aiProvider must be one of: ${VALID_AI_PROVIDERS.join(", ")}` },
        { status: 422 },
      );
    }

    // 各プロンプト: 送られたものだけ更新。空文字は null（＝組み込みデフォルトに戻す）。
    const promptData: Record<string, string | null> = {};
    for (const { key } of PROMPT_FIELDS) {
      if (body[key] !== undefined) {
        const v = body[key];
        promptData[key] = typeof v === "string" && v.trim() ? v.trim() : null;
      }
    }

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: {
        ...(typeof body.name === "string" && body.name.trim()
          ? { name: body.name.trim() }
          : {}),
        ...(isValidAiProvider(body.aiProvider)
          ? { aiProvider: body.aiProvider }
          : {}),
        // Allow clearing signature with empty string (stored as null)
        ...(body.proposalSignature !== undefined
          ? {
              proposalSignature:
                typeof body.proposalSignature === "string" &&
                body.proposalSignature.trim()
                  ? body.proposalSignature.trim()
                  : null,
            }
          : {}),
        ...promptData,
      },
    });

    return NextResponse.json({ org: updated });
  } catch (err) {
    console.error("[PATCH /api/settings]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
