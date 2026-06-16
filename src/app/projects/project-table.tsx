"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, statusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  PROJECT_STATUS_LABELS,
  REMOTE_LABELS,
} from "@/lib/enums";
import { formatRate } from "@/lib/utils";
import { FavoriteButton } from "@/components/favorite-button";
import { ProjectDrawer } from "@/components/project-drawer";
import type { Project, User } from "@prisma/client";

type ProjectWithAssignee = Project & {
  assignee: User | null;
  _count: { matches: number };
};

interface Props {
  projects: ProjectWithAssignee[];
  total: number;
  favoriteProjectIds?: Set<string>;
}

export function ProjectTable({ projects, total, favoriteProjectIds = new Set() }: Props) {
  const [openProject, setOpenProject] = useState<ProjectWithAssignee | null>(null);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-slate-700">
          {total}件
        </span>
        <Link
          href="/projects/new"
          className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
        >
          ＋ 新規案件登録
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">管理ID</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">ステータス</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">担当者</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap min-w-[180px]">案件名</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">エンド/商流</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap min-w-[160px]">必須スキル</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">単価</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">リモート</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">勤務地/最寄り駅</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">開始</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap">マッチ</th>
              <th className="w-10 px-3 py-2.5 text-center text-xs font-medium text-slate-500">★</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-slate-400 text-sm">
                  該当する案件がありません
                </td>
              </tr>
            )}
            {projects.map((p) => {
              const displaySkills = p.requiredSkills.slice(0, 3);
              const extraCount = p.requiredSkills.length - displaySkills.length;
              return (
                <tr
                  key={p.id}
                  onClick={() => setOpenProject(p)}
                  className={`transition-colors cursor-pointer ${
                    openProject?.id === p.id ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                    {p.managementId ?? "-"}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Badge tone={statusTone(p.status)}>
                      {PROJECT_STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                    {p.assignee?.name ?? "-"}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    {p.title}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                    {p.clientName ?? "-"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {displaySkills.map((s) => (
                        <Badge key={s} tone="indigo">
                          {s}
                        </Badge>
                      ))}
                      {extraCount > 0 && (
                        <Badge tone="slate">+{extraCount}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                    {formatRate(p.rateMin, p.rateMax)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                    {p.remotePreference ? (REMOTE_LABELS[p.remotePreference] ?? p.remotePreference) : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                    <div>{p.location ?? ""}</div>
                    {p.nearestStation && (
                      <div className="text-slate-400">{p.nearestStation}</div>
                    )}
                    {!p.location && !p.nearestStation && "-"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                    {p.startText ?? "-"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs whitespace-nowrap" onClick={stop}>
                    {p._count.matches > 0 ? (
                      <Link
                        href={`/matching?projectId=${p.id}`}
                        className="text-primary hover:underline"
                      >
                        {p._count.matches}
                      </Link>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center" onClick={stop}>
                    <FavoriteButton
                      projectId={p.id}
                      initial={favoriteProjectIds.has(p.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openProject && (
        <ProjectDrawer project={openProject} onClose={() => setOpenProject(null)} />
      )}
    </Card>
  );
}
