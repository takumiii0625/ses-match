"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatRate, daysAgo } from "@/lib/utils";
import {
  TALENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  GENDER_LABELS,
  REMOTE_LABELS,
} from "@/lib/enums";

export type CompareMode = "talent" | "project";

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

export interface ProjectVM {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
  requiredSkills: string[];
  rateMin: number | null;
  rateMax: number | null;
  remotePreference: string | null;
  location: string | null;
  startText: string | null;
  description: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  sourceEmail: string | null;
  receivedDate: string | null;
}

/** 右ペインの案件カード（人材起点）。クリックで詳細を出すため本文等も持つ。 */
export interface ProjectCardVM extends ProjectVM {
  matchId: string;
  score: number;
  reasons: string[];
  proposable: boolean;
  channelNote: string | null;
}

/** 右ペインの人材カード（案件起点）。 */
export interface TalentCardVM extends TalentVM {
  matchId: string;
  score: number;
  reasons: string[];
  proposable: boolean;
  channelNote: string | null;
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

function SkillTags({ main, all }: { main: string[]; all: string[] }) {
  if (main.length === 0 && all.length === 0)
    return <span className="text-sm text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {main.map((s) => (
        <Badge key={s} tone="blue">
          {s}
        </Badge>
      ))}
      {all
        .filter((s) => !main.includes(s))
        .map((s) => (
          <Badge key={s} tone="slate">
            {s}
          </Badge>
        ))}
    </div>
  );
}

// ---------- 人材のサマリ・詳細ノード ----------
function talentSummary(t: TalentVM) {
  return (
    <>
      <GF label="名前">{t.name}</GF>
      <GF label="年齢">{t.age ?? "-"}</GF>
      <GF label="性別">{t.gender ? GENDER_LABELS[t.gender] : "-"}</GF>
      <GF label="希望単価">{formatRate(t.desiredRateMin, t.desiredRateMax)}</GF>
      <GF label="リモート">
        {t.remotePreference ? REMOTE_LABELS[t.remotePreference] : "-"}
      </GF>
      <GF label="稼働開始">{t.availabilityText ?? "-"}</GF>
      <GF label="ステータス">
        <Badge tone={statusTone(t.status)}>
          {TALENT_STATUS_LABELS[t.status] ?? t.status}
        </Badge>
      </GF>
      <GF label="最寄駅">{t.nearestStation ?? "-"}</GF>
      <GF label="区分">
        {t.talentType === "INHOUSE" ? "自社" : t.talentType === "PARTNER" ? "他社" : "-"}
      </GF>
      <div className="col-span-2 sm:col-span-3">
        <div className="mb-1 text-xs text-slate-400">スキル</div>
        <SkillTags main={t.mainSkills} all={t.skills} />
      </div>
    </>
  );
}

function projectSummary(p: ProjectVM) {
  return (
    <>
      <div className="col-span-2 sm:col-span-3">
        <GF label="案件名">{p.title}</GF>
      </div>
      <GF label="クライアント/商流">{p.clientName ?? "-"}</GF>
      <GF label="単価">{formatRate(p.rateMin, p.rateMax)}</GF>
      <GF label="リモート">
        {p.remotePreference ? REMOTE_LABELS[p.remotePreference] : "-"}
      </GF>
      <GF label="募集状況">
        <Badge tone={statusTone(p.status)}>
          {PROJECT_STATUS_LABELS[p.status] ?? p.status}
        </Badge>
      </GF>
      <GF label="開始時期">{p.startText ?? "-"}</GF>
      <GF label="勤務地">{p.location ?? "-"}</GF>
      <div className="col-span-2 sm:col-span-3">
        <div className="mb-1 text-xs text-slate-400">必須スキル</div>
        {p.requiredSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {p.requiredSkills.map((s) => (
              <Badge key={s} tone="indigo">
                {s}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-slate-400">-</span>
        )}
      </div>
    </>
  );
}

interface EmailInfo {
  from: string | null;
  to: string | null;
  received: string | null;
  subject: string | null;
  body: string | null;
  fallback: string | null;
}

// ---------- 詳細本体（サマリ + タブ）。左ペインCardにも右ペインの展開部にも使う ----------
function DetailTabsBody({
  summary,
  email,
  detail,
  match,
  scrollAll = false,
}: {
  summary: React.ReactNode;
  email: EmailInfo;
  detail: React.ReactNode;
  match?: { score: number; reasons: string[] }; // 指定時「マッチング項目」タブを表示
  // true: サマリ+タブ+本文を1つのスクロール領域にまとめる（左ペイン用＝本文を広く読める）。
  // false: 本文だけが flex-1 でスクロール（アコーディオン展開部はそのまま下に伸びる）。
  scrollAll?: boolean;
}) {
  const hasEmail = !!(email.body || email.from || email.subject);
  const [tab, setTab] = useState<"mail" | "detail" | "match">(
    hasEmail ? "mail" : "detail",
  );

  const tabBtn = (key: "mail" | "detail" | "match", label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
        tab === key
          ? "border-b-2 border-primary text-primary"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );

  const body = (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border px-5 py-4 sm:grid-cols-3">
        {summary}
      </div>

      <div className="flex gap-1 border-b border-border px-3 pt-2">
        {tabBtn("mail", "メール本文")}
        {tabBtn("detail", "詳細情報")}
        {match && tabBtn("match", "マッチング項目")}
      </div>

      <div className={scrollAll ? "px-5 py-4" : "flex-1 overflow-y-auto px-5 py-4"}>
        {tab === "mail" ? (
          hasEmail || email.fallback ? (
            <div>
              <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-3">
                <MetaRow label="From:" value={email.from} />
                <MetaRow label="To:" value={email.to} />
                <MetaRow label="Received:" value={fmtDate(email.received)} />
              </div>
              {email.subject && (
                <div className="mb-2 break-words text-sm font-medium text-slate-800">
                  {email.subject}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                {email.body || email.fallback || "（本文なし）"}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              メール本文はありません（手動登録など）
            </p>
          )
        ) : tab === "detail" ? (
          detail
        ) : (
          match && <MatchTab score={match.score} reasons={match.reasons} />
        )}
      </div>
    </>
  );

  // 左ペイン: サマリも本文も含めて1つのスクロール領域にする（本文を広く読める）。
  return scrollAll ? <div className="flex-1 overflow-y-auto">{body}</div> : body;
}

// 左ペイン: Card + ヘッダ + 詳細本体
function DetailView({
  heading,
  summary,
  email,
  detail,
  editHref,
  match,
}: {
  heading: string;
  summary: React.ReactNode;
  email: EmailInfo;
  detail: React.ReactNode;
  editHref: string;
  match?: { score: number; reasons: string[] };
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="truncate text-base font-bold text-slate-800">{heading}</span>
        <Link href={editHref} className="shrink-0 text-xs text-slate-500 hover:text-primary">
          詳細・編集 →
        </Link>
      </div>
      <DetailTabsBody summary={summary} email={email} detail={detail} match={match} scrollAll />
    </Card>
  );
}

function MatchTab({ score, reasons }: { score: number; reasons: string[] }) {
  const { strengths, concerns } = splitReasons(reasons);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">マッチ度</span>
        <Badge tone={scoreTone(score)} className="text-sm tabular-nums">
          {Math.round(score)}点
        </Badge>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-emerald-700">合致点</div>
        {strengths.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
            {strengths.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">-</p>
        )}
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-amber-700">懸念点</div>
        {concerns.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
            {concerns.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">-</p>
        )}
      </div>
    </div>
  );
}

function talentEmail(t: TalentVM): EmailInfo {
  return {
    from: t.emailFrom ?? t.sourceEmail,
    to: t.emailTo,
    received: t.receivedDate,
    subject: t.emailSubject,
    body: t.emailBody,
    fallback: t.note,
  };
}
function projectEmail(p: ProjectVM): EmailInfo {
  return {
    from: p.emailFrom ?? p.sourceEmail,
    to: p.emailTo,
    received: p.receivedDate,
    subject: p.emailSubject,
    body: p.emailBody,
    fallback: p.description,
  };
}
function noteDetail(text: string | null, label: string) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-400">{label}</div>
      <p className="whitespace-pre-wrap text-sm text-slate-700">{text || "-"}</p>
    </div>
  );
}

// ---------- 右ペインのアコーディオン項目（クリックで下に詳細を展開） ----------
function AccordionItem({
  top,
  open,
  onToggle,
  header,
  detail,
}: {
  top: boolean;
  open: boolean;
  onToggle: () => void;
  header: React.ReactNode;
  detail: { summary: React.ReactNode; email: EmailInfo; detailNode: React.ReactNode; match: { score: number; reasons: string[] }; editHref: string };
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        open
          ? "border-primary/40 ring-1 ring-primary/20"
          : top
            ? "border-amber-300"
            : "border-border"
      } ${top && !open ? "bg-amber-50/60" : "bg-white"}`}
    >
      <button
        onClick={onToggle}
        className="block w-full p-4 text-left transition-colors hover:bg-slate-50"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{header}</div>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>
      {open && (
        <div className="border-t border-border">
          <DetailTabsBody
            summary={detail.summary}
            email={detail.email}
            detail={detail.detailNode}
            match={detail.match}
          />
          <div className="border-t border-border px-5 py-2 text-right">
            <Link href={detail.editHref} className="text-xs text-slate-500 hover:text-primary">
              詳細・編集ページを開く →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function projectHeader(p: ProjectCardVM, top: boolean) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {top && <Badge tone="amber">最有力</Badge>}
            <span className="truncate font-semibold text-slate-800">{p.title}</span>
          </div>
          {p.clientName && <div className="mt-0.5 text-xs text-slate-500">{p.clientName}</div>}
          <div className="mt-0.5 text-[11px] text-slate-400">配信: {daysAgo(p.receivedDate)}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={scoreTone(p.score)} className="tabular-nums">
            {Math.round(p.score)}点
          </Badge>
          {!p.proposable && <Badge tone="red">提案不可</Badge>}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
        <div>
          <span className="text-slate-400">募集状況: </span>
          <Badge tone={statusTone(p.status)}>{PROJECT_STATUS_LABELS[p.status] ?? p.status}</Badge>
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
    </>
  );
}

function talentHeader(t: TalentCardVM, top: boolean) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {top && <Badge tone="amber">最有力</Badge>}
            <span className="truncate font-semibold text-slate-800">{t.name}</span>
            <Badge tone="slate">
              {t.talentType === "INHOUSE" ? "自社" : t.talentType === "PARTNER" ? "他社" : "-"}
            </Badge>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">配信: {daysAgo(t.receivedDate)}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={scoreTone(t.score)} className="tabular-nums">
            {Math.round(t.score)}点
          </Badge>
          {!t.proposable && <Badge tone="red">提案不可</Badge>}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
        <div>
          <span className="text-slate-400">年齢: </span>
          {t.age ?? "-"}
        </div>
        <div>
          <span className="text-slate-400">希望単価: </span>
          {formatRate(t.desiredRateMin, t.desiredRateMax)}
        </div>
        <div>
          <span className="text-slate-400">稼働開始: </span>
          {t.availabilityText ?? "-"}
        </div>
        <div>
          <span className="text-slate-400">リモート: </span>
          {t.remotePreference ? REMOTE_LABELS[t.remotePreference] : "-"}
        </div>
      </div>
      {(t.mainSkills.length > 0 || t.skills.length > 0) && (
        <div className="mt-2">
          <SkillTags main={t.mainSkills} all={t.skills} />
        </div>
      )}
    </>
  );
}

// ---------- 右ペイン（一覧。各項目はクリックで下に展開） ----------
function RightPane({
  mode,
  projects,
  talents,
}: {
  mode: CompareMode;
  projects: ProjectCardVM[];
  talents: TalentCardVM[];
}) {
  // 初期は全て閉じる。複数同時に開ける（クリックで個別に開閉）。
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const count = mode === "talent" ? projects.length : talents.length;
  const title = mode === "talent" ? "対象案件リスト" : "対象人材リスト";

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden p-0">
      <div className="border-b border-border px-5 py-3">
        <span className="text-base font-bold text-slate-800">{title}</span>
        <span className="ml-2 text-sm text-muted">{count}件</span>
        <span className="ml-2 text-xs text-slate-400">クリックで本文・詳細を開閉</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {count === 0 ? (
          <div className="py-16 text-center text-sm text-muted">
            マッチした{mode === "talent" ? "案件" : "人材"}がありません。
            <Link href="/matching" className="ml-1 text-primary underline">
              マッチングを実行
            </Link>
            してください。
          </div>
        ) : mode === "talent" ? (
          projects.map((p, i) => (
            <AccordionItem
              key={p.matchId}
              top={i === 0}
              open={openIds.has(p.id)}
              onToggle={() => toggle(p.id)}
              header={projectHeader(p, i === 0)}
              detail={{
                summary: projectSummary(p),
                email: projectEmail(p),
                detailNode: noteDetail(p.description, "概要"),
                match: { score: p.score, reasons: p.reasons },
                editHref: `/projects/${p.id}`,
              }}
            />
          ))
        ) : (
          talents.map((t, i) => (
            <AccordionItem
              key={t.matchId}
              top={i === 0}
              open={openIds.has(t.id)}
              onToggle={() => toggle(t.id)}
              header={talentHeader(t, i === 0)}
              detail={{
                summary: talentSummary(t),
                email: talentEmail(t),
                detailNode: noteDetail(t.note, "備考情報"),
                match: { score: t.score, reasons: t.reasons },
                editHref: `/talent/${t.id}`,
              }}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function ModeToggle({ mode }: { mode: CompareMode }) {
  const pill = (m: CompareMode, label: string) => (
    <Link
      href={`/compare?mode=${m}`}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        mode === m ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">起点:</span>
      {pill("talent", "人材起点")}
      {pill("project", "案件起点")}
    </div>
  );
}

export function CompareView({
  mode,
  options,
  selectedId,
  talent,
  project,
  rightProjects,
  rightTalents,
}: {
  mode: CompareMode;
  options: { value: string; label: string }[];
  selectedId?: string;
  talent: TalentVM | null;
  project: ProjectVM | null;
  rightProjects: ProjectCardVM[];
  rightTalents: TalentCardVM[];
}) {
  const router = useRouter();
  const idParam = mode === "talent" ? "talentId" : "projectId";
  const leftSelected = mode === "talent" ? talent : project;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 起点トグル + セレクタ */}
      <div className="flex flex-wrap items-center gap-3">
        <ModeToggle mode={mode} />
        <div className="min-w-[260px]">
          <Select
            options={options}
            placeholder={mode === "talent" ? "人材を選択してください" : "案件を選択してください"}
            value={selectedId ?? ""}
            onChange={(e) =>
              router.push(
                e.target.value
                  ? `/compare?mode=${mode}&${idParam}=${e.target.value}`
                  : `/compare?mode=${mode}`,
              )
            }
          />
        </div>
      </div>

      {!leftSelected ? (
        <Card className="flex flex-1 items-center justify-center p-16 text-center text-sm text-muted">
          {mode === "talent"
            ? "人材を選択すると、左に人材詳細・右にマッチした案件が並びます。"
            : "案件を選択すると、左に案件詳細・右にマッチした人材が並びます。"}
        </Card>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 左 */}
          <div className="min-h-0 lg:overflow-hidden">
            {mode === "talent" && talent ? (
              <DetailView
                heading={talent.name}
                summary={talentSummary(talent)}
                email={talentEmail(talent)}
                detail={noteDetail(talent.note, "備考情報")}
                editHref={`/talent/${talent.id}`}
              />
            ) : project ? (
              <DetailView
                heading={project.title}
                summary={projectSummary(project)}
                email={projectEmail(project)}
                detail={noteDetail(project.description, "概要")}
                editHref={`/projects/${project.id}`}
              />
            ) : null}
          </div>

          {/* 右 */}
          <RightPane mode={mode} projects={rightProjects} talents={rightTalents} />
        </div>
      )}
    </div>
  );
}
