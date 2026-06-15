import { Prisma } from "@prisma/client";

// 提携先会社の検索層。一覧ページ(server)と /api/partners で共有する単一の真実。

export interface PartnerFilters {
  query?: string; // 会社名・メール・メモ
  status?: string; // ACTIVE | BOUNCED | UNSUBSCRIBED（連絡先の状態で会社を絞る）
  industry?: string;
  tagsOr?: string[];
  sort?: "created_desc" | "created_asc" | "name_asc";
}

export function parsePartnerFilters(
  sp: Record<string, string | string[] | undefined>,
): PartnerFilters {
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const list = (v: string | string[] | undefined) => {
    const s = str(v);
    return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined;
  };
  return {
    query: str(sp.query) || undefined,
    status: str(sp.status) || undefined,
    industry: str(sp.industry) || undefined,
    tagsOr: list(sp.tagsOr),
    sort: (str(sp.sort) as PartnerFilters["sort"]) || "created_desc",
  };
}

export function buildPartnerWhere(
  orgId: string,
  f: PartnerFilters,
): Prisma.PartnerCompanyWhereInput {
  const AND: Prisma.PartnerCompanyWhereInput[] = [{ orgId }];

  if (f.industry)
    AND.push({ industry: { contains: f.industry, mode: "insensitive" } });
  if (f.tagsOr?.length) AND.push({ tags: { hasSome: f.tagsOr } });

  // 連絡先の状態で会社を絞る（指定状態の連絡先を1件以上持つ会社）。
  if (f.status) AND.push({ contacts: { some: { status: f.status as never } } });

  if (f.query) {
    AND.push({
      OR: [
        { name: { contains: f.query, mode: "insensitive" } },
        { note: { contains: f.query, mode: "insensitive" } },
        { domain: { contains: f.query, mode: "insensitive" } },
        { contacts: { some: { email: { contains: f.query, mode: "insensitive" } } } },
      ],
    });
  }

  return { AND };
}

export function buildPartnerOrderBy(
  f: PartnerFilters,
): Prisma.PartnerCompanyOrderByWithRelationInput {
  switch (f.sort) {
    case "created_asc":
      return { createdAt: "asc" };
    case "name_asc":
      return { name: "asc" };
    default:
      return { createdAt: "desc" };
  }
}
