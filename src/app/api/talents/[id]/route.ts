import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";

function coerceArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (typeof v === "string") {
    return v
      .split(/[,、]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function coerceInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();
    const talent = await prisma.talent.findFirst({
      where: { id, orgId: org.id },
      include: { assignee: true, attachments: true },
    });
    if (!talent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(talent);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();
    const body = await req.json();

    const existing = await prisma.talent.findFirst({
      where: { id, orgId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const talent = await prisma.talent.update({
      where: { id },
      data: {
        managementId: body.managementId ?? null,
        status: body.status ?? existing.status,
        talentType: body.talentType ?? existing.talentType,
        dataFrom: body.dataFrom ?? existing.dataFrom,
        assigneeId: body.assigneeId ?? null,
        name: body.name ?? existing.name,
        age: coerceInt(body.age),
        gender: body.gender ?? null,
        affiliation: body.affiliation ?? null,
        employmentType: body.employmentType ?? null,
        nationality: body.nationality ?? null,
        japaneseLevel: body.japaneseLevel ?? null,
        englishLevel: body.englishLevel ?? null,
        availabilityText: body.availabilityText ?? null,
        desiredRateMin: coerceInt(body.desiredRateMin),
        desiredRateMax: coerceInt(body.desiredRateMax),
        remotePreference: body.remotePreference ?? null,
        nearestStation: body.nearestStation ?? null,
        mainSkills: coerceArr(body.mainSkills),
        skills: coerceArr(body.skills),
        qualifications: coerceArr(body.qualifications),
        tags: coerceArr(body.tags),
        emailSubject: body.emailSubject ?? null,
        distributionSubject: body.distributionSubject ?? null,
        kishaOk: body.kishaOk === true,
        note: body.note ?? null,
        summaryText: body.summaryText ?? null,
      },
    });

    return NextResponse.json(talent);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/** 部分更新（ドロワーのクイック編集用）。送られたフィールドだけ更新する。 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();
    const existing = await prisma.talent.findFirst({ where: { id, orgId: org.id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = (await req.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    // 現状サポートする部分更新項目（必要に応じて追加）。
    if ("distributionSubject" in body) {
      const v = body.distributionSubject;
      data.distributionSubject = typeof v === "string" && v.trim() ? v.trim() : null;
    }
    if ("kishaOk" in body) {
      data.kishaOk = body.kishaOk === true;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "更新する項目がありません" }, { status: 400 });
    }
    const talent = await prisma.talent.update({ where: { id }, data });
    return NextResponse.json(talent);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const org = await getCurrentOrg();

    const existing = await prisma.talent.findFirst({
      where: { id, orgId: org.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.talent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
