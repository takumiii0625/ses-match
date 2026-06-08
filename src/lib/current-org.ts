import { cache } from "react";
import { prisma } from "@/lib/prisma";

// No auth yet (MVP). The app is single-tenant in practice: we resolve the
// first organization as the "current" org. On a fresh database we bootstrap a
// default organization so the app works without a manual seed (e.g. in
// production). Swap this for a real session lookup (Auth0/Clerk) when auth is
// added — every caller goes through here.
//
// cache() でリクエスト内デデュープ: レイアウトと各ページから複数回呼ばれても、
// 1リクエストにつきDB問い合わせは1回で済む（リクエストをまたぐキャッシュではない）。
export const getCurrentOrg = cache(async () => {
  const existing = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return prisma.organization.create({
    data: {
      name: process.env.ORG_NAME ?? "OBFall株式会社",
      slug: "default",
    },
  });
});

export async function getOrgUsers(orgId: string) {
  return prisma.user.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
  });
}
