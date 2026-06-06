"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TALENT_STATUS_LABELS,
  GENDER_LABELS,
  REMOTE_LABELS,
  NATIONALITY_LABELS,
  LANGUAGE_LABELS,
  EMPLOYMENT_LABELS,
  TALENT_TYPE_LABELS,
} from "@/lib/enums";
import { formatRate, formatAge } from "@/lib/utils";

export interface TalentDrawerData {
  id: string;
  managementId?: string | null;
  status: string;
  talentType?: string | null;
  assignee?: { id: string; name: string } | null;
  name: string;
  age?: number | null;
  gender?: string | null;
  affiliation?: string | null;
  employmentType?: string | null;
  nationality?: string | null;
  japaneseLevel?: string | null;
  englishLevel?: string | null;
  availabilityText?: string | null;
  desiredRateMin?: number | null;
  desiredRateMax?: number | null;
  mainSkills: string[];
  skills: string[];
  remotePreference?: string | null;
  nearestStation?: string | null;
  note?: string | null;
  emailSubject?: string | null;
  emailBody?: string | null;
  emailFrom?: string | null;
  emailTo?: string | null;
  sourceEmail?: string | null;
  receivedDate?: Date | string | null;
  attachments: { id: string; filename: string; url: string }[];
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

export function TalentDrawer({
  talent,
  onClose,
}: {
  talent: TalentDrawerData;
  onClose: () => void;
}) {
  const hasEmail = !!(talent.emailBody || talent.emailFrom || talent.emailSubject);
  const [tab, setTab] = useState<"mail" | "detail">(hasEmail ? "mail" : "detail");

  return (
    <div className="fixed inset-0 z-40" role="dialog">
      <div className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-white shadow-xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-base font-bold text-slate-800">人材詳細情報</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* tabs */}
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

        {/* body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "mail" ? (
            hasEmail || talent.note ? (
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">メール本文</div>
                <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-3">
                  <MetaRow label="From:" value={talent.emailFrom ?? talent.sourceEmail} />
                  <MetaRow label="To:" value={talent.emailTo} />
                  <MetaRow label="Received:" value={fmtDate(talent.receivedDate)} />
                </div>
                {talent.emailSubject && (
                  <div className="mb-2 break-words text-sm font-medium text-slate-800">
                    {talent.emailSubject}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                  {talent.emailBody || talent.note || "（本文なし）"}
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
                <span className="text-base font-bold text-slate-800">{talent.name}</span>
                <Badge tone={statusTone(talent.status)}>
                  {TALENT_STATUS_LABELS[talent.status] ?? talent.status}
                </Badge>
                {talent.talentType && (
                  <Badge tone="slate">
                    {TALENT_TYPE_LABELS[talent.talentType] ?? talent.talentType}
                  </Badge>
                )}
              </div>

              {(talent.mainSkills.length > 0 || talent.skills.length > 0) && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {talent.mainSkills.map((s) => (
                    <Badge key={s} tone="blue">{s}</Badge>
                  ))}
                  {talent.skills
                    .filter((s) => !talent.mainSkills.includes(s))
                    .map((s) => (
                      <Badge key={s} tone="slate">{s}</Badge>
                    ))}
                </div>
              )}

              <div className="divide-y divide-slate-100">
                <Field label="管理ID" value={talent.managementId} />
                <Field label="担当者" value={talent.assignee?.name} />
                <Field label="年齢" value={formatAge(talent.age)} />
                <Field label="性別" value={talent.gender ? GENDER_LABELS[talent.gender] : undefined} />
                <Field label="所属" value={talent.affiliation} />
                <Field
                  label="雇用形態"
                  value={talent.employmentType ? EMPLOYMENT_LABELS[talent.employmentType] : undefined}
                />
                <Field label="希望単価" value={formatRate(talent.desiredRateMin, talent.desiredRateMax)} />
                <Field label="稼働開始" value={talent.availabilityText} />
                <Field
                  label="リモート"
                  value={talent.remotePreference ? REMOTE_LABELS[talent.remotePreference] : undefined}
                />
                <Field label="最寄り駅" value={talent.nearestStation} />
                <Field
                  label="国籍"
                  value={talent.nationality ? NATIONALITY_LABELS[talent.nationality] : undefined}
                />
                <Field
                  label="日本語"
                  value={talent.japaneseLevel ? LANGUAGE_LABELS[talent.japaneseLevel] : undefined}
                />
                <Field
                  label="英語"
                  value={talent.englishLevel ? LANGUAGE_LABELS[talent.englishLevel] : undefined}
                />
                {talent.sourceEmail && <Field label="送信元" value={talent.sourceEmail} />}
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-border px-5 py-3">
          <Link href={`/talent/${talent.id}`}>
            <Button variant="primary" size="sm" className="w-full">詳細・編集</Button>
          </Link>
        </div>
      </aside>
    </div>
  );
}
