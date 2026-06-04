import { Prisma } from "@prisma/client";

// Shared talent search layer used by both the list page (server component)
// and the /api/talents route. Single source of truth for filtering.

export interface TalentFilters {
  query?: string;
  emailSubject?: string;
  talentType?: string;
  dataFrom?: string;
  status?: string[];
  assigneeId?: string;
  gender?: string;
  employmentType?: string;
  nationality?: string;
  japaneseLevel?: string;
  englishLevel?: string;
  remote?: string[];
  skillsAnd?: string[]; // 経験スキル（AND）
  qualificationsOr?: string[]; // 資格（OR）
  tagsOr?: string[]; // タグ（OR）
  rateMin?: number;
  rateMax?: number;
  ageMin?: number;
  ageMax?: number;
  availabilityMonth?: string; // YYYY-MM
  nearestStation?: string;
  hasAttachment?: "yes" | "no";
  excludeKeyword?: string;
  sort?: "received_desc" | "received_asc" | "rate_desc" | "rate_asc";
}

/** Parse URLSearchParams (or a plain record) into typed filters. */
export function parseTalentFilters(
  sp: Record<string, string | string[] | undefined>,
): TalentFilters {
  const str = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const list = (v: string | string[] | undefined) => {
    const s = str(v);
    return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined;
  };
  const num = (v: string | string[] | undefined) => {
    const s = str(v);
    return s != null && s !== "" ? Number(s) : undefined;
  };
  return {
    query: str(sp.query) || undefined,
    emailSubject: str(sp.emailSubject) || undefined,
    talentType: str(sp.talentType) || undefined,
    dataFrom: str(sp.dataFrom) || undefined,
    status: list(sp.status),
    assigneeId: str(sp.assigneeId) || undefined,
    gender: str(sp.gender) || undefined,
    employmentType: str(sp.employmentType) || undefined,
    nationality: str(sp.nationality) || undefined,
    japaneseLevel: str(sp.japaneseLevel) || undefined,
    englishLevel: str(sp.englishLevel) || undefined,
    remote: list(sp.remote),
    skillsAnd: list(sp.skillsAnd),
    qualificationsOr: list(sp.qualificationsOr),
    tagsOr: list(sp.tagsOr),
    rateMin: num(sp.rateMin),
    rateMax: num(sp.rateMax),
    ageMin: num(sp.ageMin),
    ageMax: num(sp.ageMax),
    availabilityMonth: str(sp.availabilityMonth) || undefined,
    nearestStation: str(sp.nearestStation) || undefined,
    hasAttachment: (str(sp.hasAttachment) as "yes" | "no") || undefined,
    excludeKeyword: str(sp.excludeKeyword) || undefined,
    sort: (str(sp.sort) as TalentFilters["sort"]) || "received_desc",
  };
}

export function buildTalentWhere(
  orgId: string,
  f: TalentFilters,
): Prisma.TalentWhereInput {
  const AND: Prisma.TalentWhereInput[] = [{ orgId }];

  if (f.talentType) AND.push({ talentType: f.talentType as never });
  if (f.dataFrom) AND.push({ dataFrom: f.dataFrom as never });
  if (f.status?.length) AND.push({ status: { in: f.status as never } });
  if (f.assigneeId) AND.push({ assigneeId: f.assigneeId });
  if (f.gender) AND.push({ gender: f.gender as never });
  if (f.employmentType) AND.push({ employmentType: f.employmentType as never });
  if (f.nationality) AND.push({ nationality: f.nationality as never });
  if (f.japaneseLevel) AND.push({ japaneseLevel: f.japaneseLevel as never });
  if (f.englishLevel) AND.push({ englishLevel: f.englishLevel as never });
  if (f.remote?.length) AND.push({ remotePreference: { in: f.remote as never } });

  if (f.skillsAnd?.length) AND.push({ skills: { hasEvery: f.skillsAnd } });
  if (f.qualificationsOr?.length)
    AND.push({ qualifications: { hasSome: f.qualificationsOr } });
  if (f.tagsOr?.length) AND.push({ tags: { hasSome: f.tagsOr } });

  if (f.rateMin != null) AND.push({ desiredRateMin: { gte: f.rateMin } });
  if (f.rateMax != null) AND.push({ desiredRateMin: { lte: f.rateMax } });
  if (f.ageMin != null) AND.push({ age: { gte: f.ageMin } });
  if (f.ageMax != null) AND.push({ age: { lte: f.ageMax } });

  if (f.nearestStation)
    AND.push({ nearestStation: { contains: f.nearestStation } });

  if (f.emailSubject)
    AND.push({ emailSubject: { contains: f.emailSubject, mode: "insensitive" } });

  if (f.hasAttachment === "yes") AND.push({ attachments: { some: {} } });
  if (f.hasAttachment === "no") AND.push({ attachments: { none: {} } });

  if (f.query) {
    AND.push({
      OR: [
        { name: { contains: f.query, mode: "insensitive" } },
        { note: { contains: f.query, mode: "insensitive" } },
        { nearestStation: { contains: f.query, mode: "insensitive" } },
        { skills: { has: f.query } },
        { mainSkills: { has: f.query } },
        { tags: { has: f.query } },
      ],
    });
  }

  if (f.excludeKeyword) {
    AND.push({
      NOT: {
        OR: [
          { name: { contains: f.excludeKeyword, mode: "insensitive" } },
          { note: { contains: f.excludeKeyword, mode: "insensitive" } },
          { skills: { has: f.excludeKeyword } },
        ],
      },
    });
  }

  return { AND };
}

export function buildTalentOrderBy(
  f: TalentFilters,
): Prisma.TalentOrderByWithRelationInput {
  switch (f.sort) {
    case "received_asc":
      return { receivedDate: "asc" };
    case "rate_desc":
      return { desiredRateMin: "desc" };
    case "rate_asc":
      return { desiredRateMin: "asc" };
    default:
      return { receivedDate: "desc" };
  }
}
