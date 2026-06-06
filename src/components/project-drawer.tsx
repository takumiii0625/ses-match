"use client";

import { useState } from "react";
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
  emailFrom?: string | null;
  emailTo?: string | null;
  sourceEmail?: string | null;
  receivedDate?: Date | string | null;
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 text-xs text-slate-400">{label}</span>
      <span className="text-slate-700">{value ?? "-"}</span>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-slate-400">{label}</span>
      <span className="break-all text-slate-700">{value || "-"}</span>
    </div>
  );
}

function fmtDate(d?: Date | string | null): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProjectDrawer({
  project,
  onClose,
}: {
  project: ProjectDrawerData;
  onClose: () => void;
}) {
  const hasEmail = !!(project.emailBody || project.emailFrom || project.emailSubject);
  const [tab, setTab] = useState<"mail" | "detail">(hasEmail ? "mail" : "detail");

  return (
    <div className="fixed inset-0 z-40" role="dialog">
      <div className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-base font-bold text-slate-800">案件詳細情報</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border px-3 pt-2">
          <button
            onClick={() => setTab("mail")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === "mail"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            メール本文
          </button>
          <button
            onClick={() => setTab("detail")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === "detail"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            詳細情報
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "mail" ? (
            hasEmail || project.description ? (
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">メール本文</div>
                <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-3">
                  <MetaRow label="From:" value={project.emailFrom ?? project.sourceEmail} />
                  <MetaRow label="To:" value={project.emailTo} />
                  <MetaRow label="Received:" value={fmtDate(project.receivedDate)} />
                </div>
                {project.emailSubject && (
                  <div className="mb-2 break-words text-sm font-medium text-slate-800">
                    {project.emailSubject}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                  {project.emailBody || project.description || "（本文なし）"}
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                メール本文はありません（手動登録など）
              </p>
            )
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="break-words text-base font-bold text-slate-800">{project.title}</span>
                <Badge tone={statusTone(project.status)}>
                  {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                </Badge>
              </div>

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
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-3">
          <Link href={`/projects/${project.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">詳細・編集</Button>
          </Link>
          <Link href={`/matching?projectId=${project.id}`} className="flex-1">
            <Button variant="primary" size="sm" className="w-full">マッチする人材を検索</Button>
          </Link>
        </div>
      </aside>
    </div>
  );
}
