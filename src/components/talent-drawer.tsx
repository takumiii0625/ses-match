"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Pencil } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TALENT_STATUS_LABELS,
  GENDER_LABELS,
  REMOTE_LABELS,
  NATIONALITY_LABELS,
  LANGUAGE_LABELS,
  EMPLOYMENT_LABELS,
} from "@/lib/enums";
import { formatRate } from "@/lib/utils";

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
  availabilityDate?: Date | string | null;
  desiredRateMin?: number | null;
  desiredRateMax?: number | null;
  mainSkills: string[];
  skills: string[];
  tags?: string[];
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

function MetaRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-slate-400">{label}</span>
      <span className="break-all text-slate-700">{value || "-"}</span>
    </div>
  );
}

/** grid cell (label above value) */
function GF({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{children ?? "-"}</div>
    </div>
  );
}

/** full-width labeled row */
function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-3">
      <div className="mb-1 text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{children ?? "-"}</div>
    </div>
  );
}

function fmtDateTime(d?: Date | string | null): string {
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
function fmtDate(d?: Date | string | null): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
      <aside className="absolute right-0 top-0 flex h-full w-full flex-col border-l border-border bg-white shadow-xl md:w-1/2 md:max-w-3xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-slate-800">人材詳細情報</span>
            <Link
              href={`/talent/${talent.id}`}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" /> 編集
            </Link>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* tabs */}
        <div className="flex gap-1 border-b border-border px-3 pt-2">
          <button
            onClick={() => setTab("mail")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === "mail" ? "border-b-2 border-primary text-primary" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            メール本文
          </button>
          <button
            onClick={() => setTab("detail")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tab === "detail" ? "border-b-2 border-primary text-primary" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            詳細情報
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "mail" ? (
            hasEmail || talent.note ? (
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">メール本文</div>
                <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-3">
                  <MetaRow label="From:" value={talent.emailFrom ?? talent.sourceEmail} />
                  <MetaRow label="To:" value={talent.emailTo} />
                  <MetaRow label="Received:" value={fmtDateTime(talent.receivedDate)} />
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
            <div className="space-y-4">
              {/* grid fields */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <GF label="ステータス">
                  <Badge tone={statusTone(talent.status)}>
                    {TALENT_STATUS_LABELS[talent.status] ?? talent.status}
                  </Badge>
                </GF>
                <GF label="配信日">{fmtDate(talent.receivedDate)}</GF>
                <GF label="名前">{talent.name}</GF>
                <GF label="性別">{talent.gender ? GENDER_LABELS[talent.gender] : "-"}</GF>

                <GF label="希望単価（万円）">{formatRate(talent.desiredRateMin, talent.desiredRateMax)}</GF>
                <GF label="雇用形態">{talent.employmentType ? EMPLOYMENT_LABELS[talent.employmentType] : "-"}</GF>
                <GF label="稼働時間（時間・月）">-</GF>
                <GF label="リモート">{talent.remotePreference ? REMOTE_LABELS[talent.remotePreference] : "-"}</GF>

                <GF label="稼働開始日">{talent.availabilityText || fmtDate(talent.availabilityDate)}</GF>
                <GF label="国籍">{talent.nationality ? NATIONALITY_LABELS[talent.nationality] : "-"}</GF>
                <GF label="日本語レベル">{talent.japaneseLevel ? LANGUAGE_LABELS[talent.japaneseLevel] : "-"}</GF>
                <GF label="英語レベル">{talent.englishLevel ? LANGUAGE_LABELS[talent.englishLevel] : "-"}</GF>
              </div>

              <Row label="タグ">
                {talent.tags && talent.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {talent.tags.map((t) => (
                      <Badge key={t} tone="slate">{t}</Badge>
                    ))}
                  </div>
                ) : (
                  "未設定"
                )}
              </Row>
              <Row label="担当者">{talent.assignee?.name}</Row>
              <Row label="最寄駅">{talent.nearestStation}</Row>
              <Row label="所属">{talent.affiliation}</Row>
              <Row label="スキル">
                {talent.mainSkills.length > 0 || talent.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {talent.mainSkills.map((s) => (
                      <Badge key={s} tone="blue">{s}</Badge>
                    ))}
                    {talent.skills
                      .filter((s) => !talent.mainSkills.includes(s))
                      .map((s) => (
                        <Badge key={s} tone="slate">{s}</Badge>
                      ))}
                  </div>
                ) : (
                  "-"
                )}
              </Row>
              <Row label="備考情報">
                <span className="whitespace-pre-wrap">{talent.note || "-"}</span>
              </Row>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-border px-5 py-3">
          <Link href={`/talent/${talent.id}`}>
            <Button variant="primary" size="sm" className="w-full">詳細・編集ページを開く</Button>
          </Link>
        </div>
      </aside>
    </div>
  );
}
