import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentOrg, getOrgUsers } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { ProjectForm } from "@/components/project-form";
import { Badge, statusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PROJECT_STATUS_LABELS, REMOTE_LABELS } from "@/lib/enums";
import { formatRate } from "@/lib/utils";
import { DeleteButton } from "./delete-button";

export default async function ProjectDetailPage(props: {
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
    <div className="flex flex-col gap-6 p-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/projects"
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            ← 案件一覧
          </Link>
          <h1 className="text-xl font-bold text-slate-800">{project.title}</h1>
          <Badge tone={statusTone(project.status)}>
            {PROJECT_STATUS_LABELS[project.status] ?? project.status}
          </Badge>
        </div>
        <DeleteButton projectId={project.id} />
      </div>

      {/* Summary card */}
      <Card className="p-5">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">管理ID</dt>
            <dd className="text-slate-800 font-medium">{project.managementId ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">担当者</dt>
            <dd className="text-slate-800">{project.assignee?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">エンド/商流元</dt>
            <dd className="text-slate-800">{project.clientName ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">商流</dt>
            <dd className="text-slate-800">{project.businessFlow ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">単価</dt>
            <dd className="text-slate-800">{formatRate(project.rateMin, project.rateMax)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">リモート</dt>
            <dd className="text-slate-800">
              {project.remotePreference
                ? (REMOTE_LABELS[project.remotePreference] ?? project.remotePreference)
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">勤務地</dt>
            <dd className="text-slate-800">{project.location ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">最寄り駅</dt>
            <dd className="text-slate-800">{project.nearestStation ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">開始時期</dt>
            <dd className="text-slate-800">{project.startText ?? "-"}</dd>
          </div>
        </dl>

        {project.requiredSkills.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1.5">必須スキル</div>
            <div className="flex flex-wrap gap-1.5">
              {project.requiredSkills.map((s) => (
                <Badge key={s} tone="indigo">{s}</Badge>
              ))}
            </div>
          </div>
        )}

        {project.tags.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1.5">タグ</div>
            <div className="flex flex-wrap gap-1.5">
              {project.tags.map((t) => (
                <Badge key={t} tone="slate">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        {project.description && (
          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1.5">案件概要</div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {project.description}
            </p>
          </div>
        )}
      </Card>

      {/* Match candidates section */}
      {project.matches.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-700">
              マッチ候補 ({project.matches.length}件)
            </h2>
            <Link
              href={`/matching?projectId=${project.id}`}
              className="text-sm text-primary hover:underline"
            >
              マッチング画面で見る →
            </Link>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">人材名</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">スコア</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {project.matches.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-slate-700">{m.talent.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{m.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {project.matches.length === 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">マッチ候補なし</span>
          <Link
            href={`/matching?projectId=${project.id}`}
            className="text-sm text-primary hover:underline"
          >
            マッチングを実行する →
          </Link>
        </div>
      )}

      {/* Edit form */}
      <div>
        <h2 className="text-base font-semibold text-slate-700 mb-3">案件情報を編集</h2>
        <ProjectForm mode="edit" users={users} initial={project} />
      </div>
    </div>
  );
}
