import { getCurrentOrg } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { CreateLinkForm } from "./create-link-form";
import { LinksTable } from "./links-table";

export const dynamic = "force-dynamic";

export default async function SharedLinksPage() {
  const org = await getCurrentOrg();

  const [talents, projects, rawLinks] = await Promise.all([
    prisma.talent.findMany({
      where: { orgId: org.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { orgId: org.id },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.sharedLink.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Build lookup maps to resolve targetName for the table
  const talentMap = new Map(talents.map((t) => [t.id, t.name]));
  const projectMap = new Map(projects.map((p) => [p.id, p.title]));

  const links = rawLinks.map((link) => ({
    id: link.id,
    token: link.token,
    type: link.type as "TALENT" | "PROJECT" | "TALENT_LIST",
    targetId: link.targetId,
    label: link.label,
    createdAt: link.createdAt.toISOString(),
    targetName:
      link.type === "TALENT"
        ? (talentMap.get(link.targetId ?? "") ?? null)
        : link.type === "PROJECT"
          ? (projectMap.get(link.targetId ?? "") ?? null)
          : null,
  }));

  return (
    <div className="flex flex-col gap-6 p-6 min-h-full">
      <h1 className="text-xl font-bold text-slate-800">公開リンク</h1>

      <CreateLinkForm talents={talents} projects={projects} />

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-4">
          発行済みリンク
        </h2>
        <LinksTable links={links} />
      </Card>
    </div>
  );
}
