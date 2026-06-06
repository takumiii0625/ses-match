import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";

/**
 * Returns the org's ADMIN user, falling back to the first user in the org.
 * No auth is implemented yet — this is the MVP stand-in for "current user".
 */
export async function getCurrentUser() {
  const org = await getCurrentOrg();

  const user = await prisma.user.findFirst({
    where: { orgId: org.id, role: "ADMIN" },
  });
  if (user) return user;

  const fallback = await prisma.user.findFirst({
    where: { orgId: org.id },
  });
  if (fallback) return fallback;

  // Fresh DB — bootstrap a default admin so the app works without a seed.
  return prisma.user.create({
    data: {
      orgId: org.id,
      name: process.env.ADMIN_NAME ?? "管理者",
      email: process.env.ADMIN_EMAIL ?? `admin@${org.slug}.local`,
      role: "ADMIN",
    },
  });
}
