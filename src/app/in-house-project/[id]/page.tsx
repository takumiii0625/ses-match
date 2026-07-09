import { notFound } from "next/navigation";
import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { ProjectDetailView } from "@/components/project-detail-view";

export default async function InHouseProjectDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const org = await getCurrentOrg();
  const users = await getOrgUsers(org.id);

  const project = await prisma.project.findFirst({
    where: { id, orgId: org.id },
    include: {
      assignee: true,
      matches: {
        include: { talent: true },
        orderBy: { score: "desc" },
        take: 10,
      },
    },
  });

  if (!project) notFound();

  return (
    <ProjectDetailView
      project={project}
      users={users}
      backHref="/in-house-project"
      backLabel="自社保有案件"
    />
  );
}
