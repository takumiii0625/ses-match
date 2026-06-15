import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import {
  parseTalentFilters,
  buildTalentWhere,
  buildTalentOrderBy,
} from "@/lib/data/talent";

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

export async function GET(req: Request) {
  try {
    const org = await getCurrentOrg();
    const { searchParams } = new URL(req.url);
    const sp: Record<string, string | undefined> = {};
    searchParams.forEach((val, key) => {
      sp[key] = val;
    });
    const filters = parseTalentFilters(sp);
    const talents = await prisma.talent.findMany({
      where: buildTalentWhere(org.id, filters),
      orderBy: buildTalentOrderBy(filters),
      include: { assignee: true, attachments: true },
    });
    return NextResponse.json(talents);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const org = await getCurrentOrg();
    const body = await req.json();

    const talent = await prisma.talent.create({
      data: {
        orgId: org.id,
        managementId: body.managementId ?? null,
        status: body.status ?? "NONE",
        talentType: body.talentType ?? "INHOUSE",
        dataFrom: body.dataFrom ?? "REGISTER",
        assigneeId: body.assigneeId ?? null,
        name: body.name,
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
        note: body.note ?? null,
        summaryText: body.summaryText ?? null,
      },
    });

    return NextResponse.json(talent, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
