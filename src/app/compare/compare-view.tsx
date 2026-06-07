"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatRate } from "@/lib/utils";
import {
  TALENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  GENDER_LABELS,
  REMOTE_LABELS,
} from "@/lib/enums";

export interface TalentVM {
  id: string;
  name: string;
  status: string;
  talentType: string | null;
  age: number | null;
  gender: string | null;
  desiredRateMin: number | null;
  desiredRateMax: number | null;
  mainSkills: string[];
  skills: string[];
  remotePreference: string | null;
  availabilityText: string | null;
  nearestStation: string | null;
  note: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  sourceEmail: string | null;
  receivedDate: string | null;
}

export interface ProjectCardVM {
  matchId: string;
  score: number;
  reasons: string[];
  id: string;
  title: string;
  clientName: string | null;
  status: string;
  requiredSkills: string[];
  rateMin: number | null;
  rateMax: number | null;
  remotePreference: string | null;
  location: string | null;
  startText: string | null;
  receivedDate: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function scoreTone(score: number): "green" | "amber" | "slate" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "slate";
}

function splitReasons(reasons: string[]) {
  const strengths: string[] = [];
  const concerns: string[] = [];
  for (const r of reasons) {
    if (r.startsWith("懸念:")) concerns.push(r.replace(/^懸念:\s*/, ""));
    else strengths.push(r);
  }
  return { strengths, concerns };
}

function GF({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{children ?? "-"}</div>
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

// ---------- 左ペイン: 人材詳細 ----------
function TalentPanel({ talent }: { talent: TalentVM }) {
  const hasEmail = !!(talent.emailBody || talent.emailFrom || talent.emailSubject);
  const [tab, setTab] = useState<"mail" | "detail">(hasEmail ? "mail" : "detail");

  return (
    <Card className="flex h-full flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-base font-bold text-slate-800">人材詳細情報</span>
        <Link
          href={`/talent/${talent.id}`}
          className="text-xs text-slate-500 hover:text-primary"
        >
          詳細・編集 →
        </Link>
      </div>

      {/* サマリ */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border px-5 py-4 sm:grid-cols-3">
        <GF label="名前">{talent.name}</GF>
        <GF label="年齢">{talent.age ?? "-"}</GF>
        <GF label="性別">{talent.gender ? GENDER_LABELS[talent.gender] : "-"}</GF>
        <GF label="希望単価">{formatRate(talent.desiredRateMin, talent.desiredRateMax)}</GF>
        <GF label="リモート">
          {talent.remotePreference ? REMOTE_LABELS[talent.remotePreference] : "-"}
        </GF>
        <GF label="稼働開始">{talent.availabilityText ?? "-"}</GF>
        <GF label="ステータス">
          <Badge tone={statusTone(talent.status)}>
            {TALENT_STATUS_LABELS[talent.status] ?? talent.status}
          </Badge>
        </GF>
        <GF label="最寄駅">{talent.nearestStation ?? "-"}</GF>
        <GF label="区分">
          {talent.talentType === "INHOUSE"
            ? "自社"
            : talent.talentType === "PARTNER"
              ? "他社"
              : "-"}
        </GF>
        <div className="col-span-2 sm:col-span-3">
          <div className="mb-1 text-xs text-slate-400">スキル</div>
          {talent.mainSkills.length > 0 || talent.skills.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {talent.mainSkills.map((s) => (
                <Badge key={s} tone="blue">
                  {s}
                </Badge>
              ))}
              {talent.skills
                .filter((s) => !talent.mainSkills.includes(s))
                .map((s) => (
                  <Badge key={s} tone="slate">
                    {s}
                  </Badge>
                ))}
            </div>
          ) : (
            <span className="text-sm text-slate-400">-</span>
          )}
        </div>
      </div>

      {/* タブ */}
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
          hasEmail || talent.note ? (
            <div>
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
          <div className="space-y-3">
            <div className="text-xs text-slate-400">備考情報</div>
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {talent.note || "-"}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------- 右ペイン: 対象案件カード ----------
function ProjectCard({ p, top }: { p: ProjectCardVM; top: boolean }) {
  const { strengths, concerns } = splitReasons(p.reasons);
  return (
    <Link
      href={`/projects/${p.id}`}
      className={`block rounded-xl border p-4 transition-colors ${
        top
          ? "border-amber-300 bg-amber-50/60 hover:bg-amber-50"
          : "border-border bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {top && <Badge tone="amber">最有力</Badge>}
            <span className="truncate font-semibold text-slate-800">{p.title}</span>
          </div>
          {p.clientName && (
            <div className="mt-0.5 text-xs text-slate-500">{p.clientName}</div>
          )}
        </div>
        <Badge tone={scoreTone(p.score)} className="shrink-0 tabular-nums">
          {Math.round(p.score)}点
        </Badge>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
        <div>
          <span className="text-slate-400">募集状況: </span>
          <Badge tone={statusTone(p.status)}>
            {PROJECT_STATUS_LABELS[p.status] ?? p.status}
          </Badge>
        </div>
        <div>
          <span className="text-slate-400">開始: </span>
          {p.startText ?? "-"}
        </div>
        <div>
          <span className="text-slate-400">単価: </span>
          {formatRate(p.rateMin, p.rateMax)}
        </div>
        <div>
          <span className="text-slate-400">リモート: </span>
          {p.remotePreference ? REMOTE_LABELS[p.remotePreference] : "-"}
        </div>
      </div>

      {p.requiredSkills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.requiredSkills.map((s) => (
            <Badge key={s} tone="indigo">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {/* マッチ根拠 */}
      {(strengths.length > 0 || concerns.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1">
          {strengths.map((r, i) => (
            <span
              key={`s${i}`}
              className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700"
            >
              ✓ {r}
            </span>
          ))}
          {concerns.map((r, i) => (
            <span
              key={`c${i}`}
              className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700"
            >
              ⚠ {r}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 text-right text-[11px] text-slate-400">
        {fmtDate(p.receivedDate)}
      </div>
    </Link>
  );
}

export function CompareView({
  talents,
  selectedId,
  talent,
  projects,
}: {
  talents: { id: string; name: string }[];
  selectedId?: string;
  talent: TalentVM | null;
  projects: ProjectCardVM[];
}) {
  const router = useRouter();
  const options = talents.map((t) => ({ value: t.id, label: t.name }));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 人材セレクタ */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-600">人材を選択:</span>
        <div className="min-w-[260px]">
          <Select
            options={options}
            placeholder="人材を選択してください"
            value={selectedId ?? ""}
            onChange={(e) =>
              router.push(e.target.value ? `/compare?talentId=${e.target.value}` : "/compare")
            }
          />
        </div>
        {talent && (
          <Link
            href="/matching"
            className="ml-auto text-xs text-slate-500 underline hover:text-slate-700"
          >
            案件起点で見る（マッチング画面）→
          </Link>
        )}
      </div>

      {!talent ? (
        <Card className="flex flex-1 items-center justify-center p-16 text-sm text-muted">
          人材を選択すると、左に人材詳細・右にマッチした案件が並びます。
        </Card>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 左: 人材 */}
          <div className="min-h-0 lg:overflow-hidden">
            <TalentPanel talent={talent} />
          </div>

          {/* 右: 対象案件リスト */}
          <Card className="flex min-h-0 flex-col overflow-hidden p-0">
            <div className="border-b border-border px-5 py-3">
              <span className="text-base font-bold text-slate-800">対象案件リスト</span>
              <span className="ml-2 text-sm text-muted">{projects.length}件</span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {projects.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">
                  マッチした案件がありません。
                  <Link href="/matching" className="ml-1 text-primary underline">
                    マッチングを実行
                  </Link>
                  してください。
                </div>
              ) : (
                projects.map((p, i) => <ProjectCard key={p.matchId} p={p} top={i === 0} />)
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
