import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAI } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import type { RemotePreference } from "@/generated/prisma/enums";

// Valid RemotePreference enum values (must stay in sync with schema.prisma)
const VALID_REMOTE = new Set<RemotePreference>([
  "FULL_REMOTE",
  "MOSTLY_REMOTE",
  "HYBRID",
  "OFFICE_1",
  "OFFICE_2",
  "OFFICE_3",
  "OFFICE_4",
  "ONSITE",
]);

function toRemote(val?: string | null): RemotePreference | undefined {
  if (!val) return undefined;
  return VALID_REMOTE.has(val as RemotePreference)
    ? (val as RemotePreference)
    : undefined;
}

/** Split a comma/Japanese-comma separated string into a trimmed, non-empty array. */
function toArray(val?: string): string[] {
  if (!val || !val.trim()) return [];
  return val
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Convert a string to an integer, returning undefined if empty or NaN. */
function toInt(val?: string): number | undefined {
  if (!val || !val.trim()) return undefined;
  const n = parseInt(val, 10);
  return isNaN(n) ? undefined : n;
}

// ---- Zod schemas -----------------------------------------------------------

const ParseRequestSchema = z.object({
  type: z.enum(["talent", "project"]),
  rawEmail: z.string().min(1),
});

const CreateTalentSchema = z.object({
  type: z.literal("talent"),
  action: z.literal("create"),
  data: z.object({
    name: z.string(),
    age: z.string().optional(),
    skills: z.string().optional(),
    mainSkills: z.string().optional(),
    desiredRateMin: z.string().optional(),
    desiredRateMax: z.string().optional(),
    remotePreference: z.string().optional(),
    availabilityText: z.string().optional(),
    nearestStation: z.string().optional(),
    note: z.string().optional(),
  }),
});

const CreateProjectSchema = z.object({
  type: z.literal("project"),
  action: z.literal("create"),
  data: z.object({
    title: z.string(),
    clientName: z.string().optional(),
    requiredSkills: z.string().optional(),
    rateMin: z.string().optional(),
    rateMax: z.string().optional(),
    remotePreference: z.string().optional(),
    location: z.string().optional(),
    startText: z.string().optional(),
    description: z.string().optional(),
  }),
});

const CreateRequestSchema = z.discriminatedUnion("type", [
  CreateTalentSchema,
  CreateProjectSchema,
]);

// ---- Handler ---------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Check if this is a parse or create request
  const hasAction = typeof body === "object" && body !== null && "action" in body;

  if (!hasAction) {
    // ---- Parse flow --------------------------------------------------------
    const result = ParseRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    const { type, rawEmail } = result.data;
    const ai = getAI();
    try {
      const parsed =
        type === "talent"
          ? await ai.parseTalentEmail(rawEmail)
          : await ai.parseProjectEmail(rawEmail);
      return NextResponse.json({ parsed });
    } catch (e) {
      console.error("[ingest] parse error", e);
      return NextResponse.json({ error: "AI解析に失敗しました" }, { status: 500 });
    }
  }

  // ---- Create flow ---------------------------------------------------------
  const result = CreateRequestSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  let org: Awaited<ReturnType<typeof getCurrentOrg>>;
  try {
    org = await getCurrentOrg();
  } catch (e) {
    console.error("[ingest] org error", e);
    return NextResponse.json(
      { error: "組織が見つかりません。db:seedを実行してください。" },
      { status: 500 },
    );
  }

  try {
    if (result.data.type === "talent") {
      const { data } = result.data;
      const talent = await prisma.talent.create({
        data: {
          orgId: org.id,
          talentType: "INHOUSE",
          dataFrom: "EMAIL",
          name: data.name || "（未設定）",
          age: toInt(data.age),
          skills: toArray(data.skills),
          mainSkills: toArray(data.mainSkills),
          desiredRateMin: toInt(data.desiredRateMin),
          desiredRateMax: toInt(data.desiredRateMax),
          remotePreference: toRemote(data.remotePreference),
          availabilityText: data.availabilityText || undefined,
          nearestStation: data.nearestStation || undefined,
          note: data.note || undefined,
        },
      });
      return NextResponse.json({ id: talent.id });
    } else {
      const { data } = result.data;
      const project = await prisma.project.create({
        data: {
          orgId: org.id,
          dataFrom: "EMAIL",
          title: data.title || "（未設定）",
          clientName: data.clientName || undefined,
          requiredSkills: toArray(data.requiredSkills),
          rateMin: toInt(data.rateMin),
          rateMax: toInt(data.rateMax),
          remotePreference: toRemote(data.remotePreference),
          location: data.location || undefined,
          startText: data.startText || undefined,
          description: data.description || undefined,
        },
      });
      return NextResponse.json({ id: project.id });
    }
  } catch (e) {
    console.error("[ingest] create error", e);
    return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
  }
}
