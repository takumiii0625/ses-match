import { prisma } from "@/lib/prisma";

// No auth yet (MVP). The app is single-tenant in practice: we resolve the
// first organization as the "current" org. Swap this for a real session
// lookup (Auth0/Clerk) when auth is added — every caller goes through here.
export async function getCurrentOrg() {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!org) throw new Error("No organization found. Run `pnpm db:seed`.");
  return org;
}

export async function getOrgUsers(orgId: string) {
  return prisma.user.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
  });
}
