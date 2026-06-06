"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROJECT_STATUS_LABELS, REMOTE_LABELS } from "@/lib/enums";
import { formatRate } from "@/lib/utils";

export interface ProjectDrawerData {
  id: string;
  managementId?: string | null;
  title: string;
  status: string;
  clientName?: string | null;
  businessFlow?: string | null;
  assignee?: { id: string; name: string } | null;
  requiredSkills: string[];
  rateMin?: number | null;
  rateMax?: number | null;
  remotePreference?: string | null;
  location?: string | null;
  nearestStation?: string | null;
  startText?: string | null;
  description?: string | null;
  emailSubject?: string | null;
  emailBody?: string | null;
  sourceEmail?: string | null;
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 text-xs text-slate-400">{label}</span>
      <span className="text-slate-700">{value ?? "-"}</span>
    </div>
  );
}

export function ProjectDrawer({
  project,
  onClose,
}: {
  project: ProjectDrawerData;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40" role="dialog">
      <div className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-white px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-bold text-slate-800">{project.title}</span>
            <Badge tone={statusTone(project.status)}>
              {PROJECT_STATUS_LABELS[project.status] ?? project.status}
            </Badge>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          {project.requiredSkills.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1">
              {project.requiredSkills.map((s) => (
                <Badge key={s} tone="indigo">{s}</Badge>
              ))}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            <Field label="管理ID" value={project.managementId} />
            <Field label="担当者" value={project.assignee?.name} />
            <Field label="エンド/商流" value={project.clientName} />
            <Field label="商流" value={project.businessFlow} />
            <Field label="単価" value={formatRate(project.rateMin, project.rateMax)} />
            <Field
              label="リモート"
              value={project.remotePreference ? REMOTE_LABELS[project.remotePreference] : undefined}
            />
            <Field label="勤務地" value={project.location} />
            <Field label="最寄り駅" value={project.nearestStation} />
            <Field label="開始時期" value={project.startText} />
            {project.sourceEmail && <Field label="送信元" value={project.sourceEmail} />}
          </div>

          {project.description && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold text-slate-500">概要</div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{project.description}</p>
            </div>
          )}

          {(project.emailSubject || project.emailBody) && (
            <div className="mt-5">
              <div className="mb-2 text-xs font-semibold text-slate-500">メール</div>
              {project.emailSubject && (
                <div className="mb-2 break-words text-sm font-medium text-slate-800">
                  件名: {project.emailSubject}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words rounded-lg border border-border bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                {project.emailBody || "（本文なし）"}
              </div>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <Link href={`/projects/${project.id}`} className="flex-1">
              <Button variant="primary" size="sm" className="w-full">詳細・編集</Button>
            </Link>
            <Link href={`/matching?projectId=${project.id}`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full">マッチング</Button>
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
