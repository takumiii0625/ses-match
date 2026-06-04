import { Prisma } from "@prisma/client";

// Shared project search layer used by both the list page (server component)
// and the /api/projects route. Single source of truth for filtering.

export interface ProjectFilters {
  query?: string;
  status?: string[];
  dataFrom?: string;
  assigneeId?: string;
  requiredSkillsAnd?: string[]; // 必須スキル（AND）
  tagsOr?: string[]; // タグ（OR）
  remote?: string[];
  rateMin?: number;
  rateMax?: number;
  nearestStation?: string;
  excludeKeyword?: string;
  sort?: "received_desc" | "received_asc" | "rate_desc" | "rate_asc";
}

/** Parse URLSearchParams (or a plain record) into typed filters. */
export function parseProjectFilters(
  sp: Record<string, string | string[] | undefined>,
): ProjectFilters {
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
    dataFrom: str(sp.dataFrom) || undefined,
    status: list(sp.status),
    assigneeId: str(sp.assigneeId) || undefined,
    remote: list(sp.remote),
    requiredSkillsAnd: list(sp.requiredSkillsAnd),
    tagsOr: list(sp.tagsOr),
    rateMin: num(sp.rateMin),
    rateMax: num(sp.rateMax),
    nearestStation: str(sp.nearestStation) || undefined,
    excludeKeyword: str(sp.excludeKeyword) || undefined,
    sort: (str(sp.sort) as ProjectFilters["sort"]) || "received_desc",
  };
}

export function buildProjectWhere(
  orgId: string,
  f: ProjectFilters,
): Prisma.ProjectWhereInput {
  const AND: Prisma.ProjectWhereInput[] = [{ orgId }];

  if (f.dataFrom) AND.push({ dataFrom: f.dataFrom as never });
  if (f.status?.length) AND.push({ status: { in: f.status as never } });
  if (f.assigneeId) AND.push({ assigneeId: f.assigneeId });
  if (f.remote?.length) AND.push({ remotePreference: { in: f.remote as never } });

  if (f.requiredSkillsAnd?.length)
    AND.push({ requiredSkills: { hasEvery: f.requiredSkillsAnd } });
  if (f.tagsOr?.length) AND.push({ tags: { hasSome: f.tagsOr } });

  if (f.rateMin != null) AND.push({ rateMin: { gte: f.rateMin } });
  if (f.rateMax != null) AND.push({ rateMin: { lte: f.rateMax } });

  if (f.nearestStation)
    AND.push({ nearestStation: { contains: f.nearestStation, mode: "insensitive" } });

  if (f.query) {
    AND.push({
      OR: [
        { title: { contains: f.query, mode: "insensitive" } },
        { description: { contains: f.query, mode: "insensitive" } },
        { clientName: { contains: f.query, mode: "insensitive" } },
        { requiredSkills: { has: f.query } },
      ],
    });
  }

  if (f.excludeKeyword) {
    AND.push({
      NOT: {
        OR: [
          { title: { contains: f.excludeKeyword, mode: "insensitive" } },
          { description: { contains: f.excludeKeyword, mode: "insensitive" } },
          { requiredSkills: { has: f.excludeKeyword } },
        ],
      },
    });
  }

  return { AND };
}

export function buildProjectOrderBy(
  f: ProjectFilters,
): Prisma.ProjectOrderByWithRelationInput {
  switch (f.sort) {
    case "received_asc":
      return { receivedDate: "asc" };
    case "rate_desc":
      return { rateMin: "desc" };
    case "rate_asc":
      return { rateMin: "asc" };
    default:
      return { receivedDate: "desc" };
  }
}
