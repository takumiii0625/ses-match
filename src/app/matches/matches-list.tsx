"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatRate, daysAgo } from "@/lib/utils";
import { talentDedupeKey, projectDedupeKey } from "@/lib/dedupe";
import { channelStatus } from "@/lib/channel";
import { REMOTE_LABELS } from "@/lib/enums";
import { useSendController, SendPanel, pairKey } from "@/components/send-mail";
import { MatchSourceInfo, ProjectSourceDisclosure } from "./match-source-info";
import { ProposalButton } from "../matching/proposal-button";

// サーバから渡る軽量ビューモデル（Prisma型から必要分だけ抜き出して直列化）。
export interface MatchVM {
  id: string;
  score: number;
  reasons: string[];
  proposable: boolean;
  channelNote: string | null;
  locationOk: boolean | null; // 勤務地・勤務形態OKか（true=OKラベル表示、null=未評価）
  sentInfoAt: string | null; // 案件案内メールを送信済みの日時（未送信なら null）
  sentTalentAt: string | null; // 要員提案メールを送信済みの日時（未送信なら null。自社マッチで使用）
  talent: {
    id: string;
    name: string;
    talentType: string | null;
    affiliation: string | null;
    mainSkills: string[];
    skills: string[];
    desiredRateMin: number | null;
    desiredRateMax: number | null;
    remotePreference: string | null;
    receivedDate: string | null;
  };
  project: {
    id: string;
    title: string;
    clientName: string | null;
    rateMin: number | null;
    rateMax: number | null;
    requiredSkills: string[];
    receivedDate: string | null;
    channelText: string | null;
    supportFee: boolean;
  };
}

const SCORE_OPTIONS = [
  { value: "70", label: "70点以上" },
  { value: "80", label: "80点以上" },
  { value: "90", label: "90点以上" },
];

const TYPE_OPTIONS = [
  { value: "ALL", label: "自社＋他社" },
  { value: "INHOUSE", label: "自社保有人材" },
  { value: "PARTNER", label: "他社人材" },
];

function scoreBadgeTone(score: number): "green" | "amber" | "slate" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "slate";
}

/** 送信済みバッジ用の短い日付（M/D）。 */
export function fmtSentDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
}

/** reasons[] を「合致点」と「懸念点」に振り分ける。 */
function splitReasons(reasons: string[]): { strengths: string[]; concerns: string[] } {
  const strengths: string[] = [];
  const concerns: string[] = [];
  for (const r of reasons) {
    if (r.startsWith("懸念:")) concerns.push(r.replace(/^懸念:\s*/, ""));
    else strengths.push(r);
  }
  return { strengths, concerns };
}

const DAYS_OPTIONS = [
  { value: "1", label: "配信: 直近1日" },
  { value: "3", label: "配信: 直近3日" },
  { value: "7", label: "配信: 直近7日" },
  { value: "30", label: "配信: 直近30日" },
  { value: "all", label: "配信: 全期間" },
];

function SkillChips({ main, all, limit = 8 }: { main: string[]; all: string[]; limit?: number }) {
  const extra = all.filter((s) => !main.includes(s));
  const shown = [...main, ...extra].slice(0, limit);
  if (shown.length === 0) return <span className="text-xs text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <Badge key={s} tone={main.includes(s) ? "blue" : "slate"} className="text-xs">
          {s}
        </Badge>
      ))}
    </div>
  );
}

/** 行の中身（起点に応じて「相手側」＝人材 or 案件 を表示）。 */
function MatchRowContent({ m, dupes, show }: { m: MatchVM; dupes: number; show: "talent" | "project" }) {
  const cs = channelStatus(m.proposable, m.channelNote);
  const t = m.talent;
  const p = m.project;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-slate-800">{show === "talent" ? t.name : p.title}</span>
        <Badge tone={scoreBadgeTone(m.score)} className="tabular-nums">{Math.round(m.score)}点</Badge>
        {cs && <Badge tone={cs.tone}>{cs.label}</Badge>}
        {m.locationOk === true && <Badge tone="green">勤務地OK</Badge>}
        {dupes > 1 && <Badge tone="slate">同一{dupes}</Badge>}
        {m.sentInfoAt && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            ✉ {fmtSentDate(m.sentInfoAt)}
          </span>
        )}
      </div>
      {show === "talent" ? (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
            {t.affiliation && <span>所属: {t.affiliation}</span>}
            {(t.desiredRateMin != null || t.desiredRateMax != null) && (
              <span>希望: {formatRate(t.desiredRateMin, t.desiredRateMax)}</span>
            )}
            {t.remotePreference && <span>{REMOTE_LABELS[t.remotePreference] ?? t.remotePreference}</span>}
          </div>
          <div className="mt-1.5">
            <SkillChips main={t.mainSkills} all={t.skills} limit={5} />
          </div>
        </>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
            {p.clientName && <span>{p.clientName}</span>}
            {(p.rateMin != null || p.rateMax != null) && (
              <span>単価: {formatRate(p.rateMin, p.rateMax)}</span>
            )}
            {p.channelText && <span>商流: {p.channelText}</span>}
          </div>
          <div className="mt-1.5">
            <SkillChips main={p.requiredSkills} all={[]} limit={5} />
          </div>
        </>
      )}
    </div>
  );
}

export function MatchesList({
  matches,
  scope = "all",
  days = "1",
}: {
  matches: MatchVM[];
  scope?: "all" | "inhouse";
  days?: string;
}) {
  const inhouseOnly = scope === "inhouse";
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState("70");
  const [talentType, setTalentType] = useState("ALL");
  // 起点（グルーピング）: 案件ごと / 人材ごと。
  const [groupMode, setGroupMode] = useState<"project" | "talent">("project");
  // 右ペインに出す選択中マッチ（行クリックで設定。チェックボックスとは別概念）。
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // メール編集・単体/一斉送信を統括する共有コントローラ。
  const ctrl = useSendController();

  function changeDays(v: string) {
    const params = new URLSearchParams();
    if (v && v !== "1") params.set("days", v);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const isFiltered =
    !!query || minScore !== "70" || (!inhouseOnly && talentType !== "ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Number(minScore);
    return matches.filter((m) => {
      if (m.score < min) return false;
      if (talentType !== "ALL" && m.talent.talentType !== talentType) return false;
      if (!q) return true;
      const hay = [
        m.project.title,
        m.project.clientName ?? "",
        m.talent.name,
        ...m.talent.mainSkills,
        ...m.talent.skills,
        ...m.project.requiredSkills,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [matches, query, minScore, talentType]);

  // 起点に応じてグループ化。重複（同名案件/同一人材）はまとめ、最新配信を代表にする。
  // project: 案件ごと（行＝人材）／ talent: 人材ごと（行＝案件）。
  const groups = useMemo(() => {
    const byTalent = groupMode === "talent";
    const headKey = (m: MatchVM) =>
      byTalent
        ? talentDedupeKey(m.talent.name, m.talent.mainSkills)
        : projectDedupeKey(m.project.title, m.project.clientName);
    const headMs = (m: MatchVM) => {
      const d = byTalent ? m.talent.receivedDate : m.project.receivedDate;
      return d ? Date.parse(d) : 0;
    };
    const rowKey = (m: MatchVM) =>
      byTalent
        ? projectDedupeKey(m.project.title, m.project.clientName)
        : talentDedupeKey(m.talent.name, m.talent.mainSkills);
    const rowMs = (m: MatchVM) => {
      const d = byTalent ? m.project.receivedDate : m.talent.receivedDate;
      return d ? Date.parse(d) : 0;
    };

    const rep = new Map<string, { m: MatchVM; ms: number }>();
    for (const m of filtered) {
      const k = headKey(m);
      const ms = headMs(m);
      const cur = rep.get(k);
      if (!cur || ms > cur.ms) rep.set(k, { m, ms });
    }
    const byKey = new Map<string, { repM: MatchVM; rows: Map<string, { m: MatchVM; ms: number; dupes: number }> }>();
    for (const m of filtered) {
      const hk = headKey(m);
      let g = byKey.get(hk);
      if (!g) {
        g = { repM: rep.get(hk)!.m, rows: new Map() };
        byKey.set(hk, g);
      }
      const rk = rowKey(m);
      const ms = rowMs(m);
      const cur = g.rows.get(rk);
      if (!cur) g.rows.set(rk, { m, ms, dupes: 1 });
      else {
        cur.dupes++;
        if (ms > cur.ms) {
          cur.m = m;
          cur.ms = ms;
        }
      }
    }
    return [...byKey.values()]
      .map((g) => ({
        key: byTalent ? g.repM.talent.id : g.repM.project.id,
        project: byTalent ? null : g.repM.project,
        talent: byTalent ? g.repM.talent : null,
        rows: [...g.rows.values()]
          .map((x) => ({ m: x.m, dupes: x.dupes }))
          .sort((a, b) => b.m.score - a.m.score),
      }))
      .sort((a, b) => (b.rows[0]?.m.score ?? 0) - (a.rows[0]?.m.score ?? 0));
  }, [filtered, groupMode]);

  // 全行をフラットに（選択中マッチの取得・一覧キーに使う）。
  const flatRows = useMemo(
    () => groups.flatMap((g) => g.rows.map((r) => r.m)),
    [groups],
  );
  const shownCount = flatRows.length;

  const keyOf = (m: MatchVM) => pairKey({ talentId: m.talent.id, projectId: m.project.id });
  const isSent = (m: MatchVM) => !!m.sentInfoAt || !!ctrl.get(keyOf(m))?.sentTo;
  const selectedMatch = flatRows.find((m) => keyOf(m) === selectedKey) ?? null;

  // 一斉送信に選べる行（未送信）。
  const eligibleKeys = flatRows.filter((m) => !isSent(m)).map(keyOf);
  const allSelected =
    eligibleKeys.length > 0 && eligibleKeys.every((k) => ctrl.selected.has(k));
  const allPairs = flatRows.map((m) => ({ talentId: m.talent.id, projectId: m.project.id }));

  return (
    <div className="flex flex-col gap-4">
      {/* スコープ切替タブ */}
      <div className="flex gap-1 border-b border-border">
        <Link
          href="/matches"
          className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
            scope === "all"
              ? "border-b-2 border-primary text-primary"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          すべてのマッチ
        </Link>
        <Link
          href="/matches/inhouse"
          className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
            inhouseOnly
              ? "border-b-2 border-primary text-primary"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          自社保有人材のマッチ
        </Link>
      </div>

      {/* フィルタ */}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            案件名・人材名・スキルで検索
          </label>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: Java / 田中 / ◯◯案件"
          />
        </div>
        {!inhouseOnly && (
          <div className="w-36">
            <label className="mb-1 block text-xs font-medium text-slate-500">区分</label>
            <Select options={TYPE_OPTIONS} value={talentType} onChange={(e) => setTalentType(e.target.value)} />
          </div>
        )}
        <div className="w-28">
          <label className="mb-1 block text-xs font-medium text-slate-500">点数</label>
          <Select options={SCORE_OPTIONS} value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        </div>
        {!inhouseOnly && (
          <div className="w-36">
            <label className="mb-1 block text-xs font-medium text-slate-500">配信日</label>
            <Select options={DAYS_OPTIONS} value={days} onChange={(e) => changeDays(e.target.value)} />
          </div>
        )}
        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setMinScore("70");
              setTalentType("ALL");
            }}
            className="h-10 text-sm text-slate-500 underline hover:text-slate-700"
          >
            クリア
          </button>
        )}
      </Card>

      {ctrl.bulkMsg && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            ctrl.bulkMsg.tone === "err"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          一括送信の結果: {ctrl.bulkMsg.text}
        </div>
      )}

      {groups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          {matches.length === 0 ? (
            <>
              まだ保存済みのマッチがありません。
              <Link href="/matching" className="ml-1 text-primary underline">
                マッチングを実行
              </Link>
              してください。
            </>
          ) : (
            "条件に一致するマッチがありません。フィルタを変えてください。"
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* 左: 一覧 */}
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                {/* 起点切替 */}
                <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setGroupMode("project")}
                    className={`rounded-md px-2.5 py-1 font-medium ${
                      groupMode === "project" ? "bg-primary text-white" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    案件ごと
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupMode("talent")}
                    className={`rounded-md px-2.5 py-1 font-medium ${
                      groupMode === "talent" ? "bg-primary text-white" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    人材ごと
                  </button>
                </div>
                <span className="text-sm font-medium text-muted">
                  {shownCount} 件（{groups.length} {groupMode === "talent" ? "人材" : "案件"}）
                </span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={allSelected}
                  disabled={eligibleKeys.length === 0}
                  onChange={() => ctrl.selectMany(eligibleKeys, !allSelected)}
                />
                未送信をすべて選択
              </label>
            </div>

            {groups.map((g) => {
              const project = g.project;
              const talent = g.talent;
              const rowShow = groupMode === "talent" ? "project" : "talent";
              return (
                <Card key={g.key} className="overflow-hidden p-0">
                  {/* グループ見出し（起点に応じて 案件 or 人材） */}
                  <div className="border-b border-border bg-slate-50/60 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {project ? (
                        <>
                          <span className="font-semibold text-foreground">{project.title}</span>
                          <Badge tone="slate">{g.rows.length}名</Badge>
                          {(project.rateMin != null || project.rateMax != null) && (
                            <span className="text-xs text-muted">単価: {formatRate(project.rateMin, project.rateMax)}</span>
                          )}
                          {project.channelText && <Badge tone="amber">{project.channelText}</Badge>}
                          {project.supportFee && <Badge tone="green">支援費あり</Badge>}
                          <span className="ml-auto text-xs text-muted">配信: {daysAgo(project.receivedDate)}</span>
                          {/* 案件の元メール・概要（左の案件ヘッダーに開閉表示） */}
                          <div className="w-full">
                            <ProjectSourceDisclosure projectId={project.id} />
                          </div>
                        </>
                      ) : talent ? (
                        <>
                          <span className="font-semibold text-foreground">{talent.name}</span>
                          <Badge tone="slate">{g.rows.length}件</Badge>
                          {talent.affiliation && <span className="text-xs text-muted">所属: {talent.affiliation}</span>}
                          {(talent.desiredRateMin != null || talent.desiredRateMax != null) && (
                            <span className="text-xs text-muted">希望: {formatRate(talent.desiredRateMin, talent.desiredRateMax)}</span>
                          )}
                          {talent.remotePreference && (
                            <span className="text-xs text-muted">{REMOTE_LABELS[talent.remotePreference] ?? talent.remotePreference}</span>
                          )}
                          <span className="ml-auto text-xs text-muted">配信: {daysAgo(talent.receivedDate)}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* 行（クリックで右に詳細・メール） */}
                  <div className="divide-y divide-border">
                    {g.rows.map(({ m, dupes }) => {
                      const key = keyOf(m);
                      const sent = isSent(m);
                      const active = selectedKey === key;
                      return (
                        <div
                          key={m.id}
                          onClick={() => setSelectedKey(key)}
                          className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${
                            active ? "bg-primary/10" : "hover:bg-slate-50"
                          }`}
                        >
                          <div
                            className="flex w-5 shrink-0 justify-center pt-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {sent ? (
                              <span className="text-emerald-500" title="送信済み">✓</span>
                            ) : (
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300"
                                checked={ctrl.selected.has(key)}
                                onChange={() => ctrl.toggleSelect(key)}
                                title="一斉送信に選択"
                              />
                            )}
                          </div>
                          <div className="w-9 shrink-0 text-center">
                            <div className="text-base font-bold tabular-nums text-slate-700">
                              {Math.round(m.score)}
                            </div>
                          </div>
                          <MatchRowContent m={m} dupes={dupes} show={rowShow} />
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* 右: 選択マッチの詳細＋メール（画面遷移なし） */}
          <div className="min-w-0">
            <div className="lg:sticky lg:top-4">
              {selectedMatch ? (
                <MatchDetailPanel m={selectedMatch} controller={ctrl} sent={isSent(selectedMatch)} groupMode={groupMode} />
              ) : (
                <Card className="flex items-center justify-center p-12 text-center text-sm text-muted">
                  左の一覧から人材を選ぶと、ここに案件・人材の詳細とメール内容が表示され、そのまま送信できます。
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 一斉送信バー（選択中のみ・画面下部に固定） */}
      {ctrl.selected.size > 0 && (
        <div className="sticky bottom-4 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-full border border-border bg-white px-5 py-3 shadow-lg">
          <span className="text-sm font-medium text-slate-700">{ctrl.selected.size} 件選択中</span>
          <button
            type="button"
            onClick={ctrl.clearSelection}
            disabled={ctrl.bulkSending}
            className="text-xs text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
          >
            選択解除
          </button>
          <button
            type="button"
            onClick={() => ctrl.sendSelected(allPairs)}
            disabled={ctrl.bulkSending}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {ctrl.bulkSending ? "送信中…" : `選択した ${ctrl.selected.size} 件を送信`}
          </button>
        </div>
      )}
    </div>
  );
}

/** 右ペイン: 選択マッチの案件・人材サマリ＋マッチ根拠＋編集可能なメール送信。 */
function MatchDetailPanel({
  m,
  controller,
  sent,
  groupMode,
}: {
  m: MatchVM;
  controller: ReturnType<typeof useSendController>;
  sent: boolean;
  groupMode: "project" | "talent";
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const t = m.talent;
  const p = m.project;
  const { strengths, concerns } = splitReasons(m.reasons);
  const pair = { talentId: t.id, projectId: p.id };

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectErr, setRejectErr] = useState<string | null>(null);

  async function doReject() {
    if (!reason.trim() || rejectBusy) return;
    setRejectBusy(true);
    setRejectErr(null);
    try {
      const res = await fetch(`/api/matches/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reject: true, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "差し戻しに失敗しました");
      setRejecting(false);
      setReason("");
      startTransition(() => router.refresh());
    } catch (e) {
      setRejectErr(e instanceof Error ? e.message : "差し戻しに失敗しました");
    } finally {
      setRejectBusy(false);
    }
  }

  return (
    <Card className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/talent/${t.id}`} className="truncate font-bold text-slate-800 hover:text-primary hover:underline">
              {t.name}
            </Link>
            <Badge tone={scoreBadgeTone(m.score)} className="tabular-nums">{Math.round(m.score)}点</Badge>
            {sent && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                ✉ 送信済み
              </span>
            )}
          </div>
          <Link href={`/projects/${p.id}`} className="mt-0.5 block truncate text-xs text-slate-500 hover:text-primary hover:underline">
            案件: {p.title}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setRejecting((v) => !v)}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
            title="このマッチを送らずに差し戻す（一覧から隠す）"
          >
            差し戻し
          </button>
          <ProposalButton talentId={t.id} projectId={p.id} />
        </div>
      </div>

      {/* 差し戻しの理由入力 */}
      {rejecting && (
        <div className="space-y-2 border-b border-red-200 bg-red-50/60 px-5 py-3">
          <label className="block text-xs font-medium text-red-700">
            差し戻し理由（記録に残ります。送信対象・一覧から除外されます）
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="例: 単価が合わない / 既に充足 / 商流が深すぎる など"
            className="w-full resize-y rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
          />
          {rejectErr && <p className="text-xs text-red-600">{rejectErr}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setReason("");
              }}
              disabled={rejectBusy}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-slate-600 hover:bg-white disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={doReject}
              disabled={rejectBusy || !reason.trim()}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {rejectBusy ? "処理中…" : "差し戻す"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {/* 案件・人材サマリ */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="mb-1 text-xs font-semibold text-slate-500">案件</div>
            <div className="text-sm font-medium text-slate-800">{p.title}</div>
            {p.clientName && <div className="mt-0.5 text-xs text-muted">{p.clientName}</div>}
            <div className="mt-1 text-xs text-muted">単価: {formatRate(p.rateMin, p.rateMax)}</div>
            {p.channelText && <div className="mt-0.5 text-xs text-muted">商流: {p.channelText}{p.supportFee ? "（支援費あり）" : ""}</div>}
            {p.requiredSkills.length > 0 && (
              <div className="mt-1.5">
                <SkillChips main={p.requiredSkills} all={[]} />
              </div>
            )}
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="mb-1 text-xs font-semibold text-slate-500">人材</div>
            <div className="text-sm font-medium text-slate-800">{t.name}</div>
            {t.affiliation && <div className="mt-0.5 text-xs text-muted">{t.affiliation}</div>}
            <div className="mt-1 text-xs text-muted">希望: {formatRate(t.desiredRateMin, t.desiredRateMax)}</div>
            {t.remotePreference && (
              <div className="mt-0.5 text-xs text-muted">{REMOTE_LABELS[t.remotePreference] ?? t.remotePreference}</div>
            )}
            <div className="mt-1.5">
              <SkillChips main={t.mainSkills} all={t.skills} />
            </div>
          </div>
        </div>

        {/* マッチ根拠 */}
        {(strengths.length > 0 || concerns.length > 0) && (
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-500">マッチ根拠</div>
            <div className="flex flex-wrap gap-1">
              {strengths.map((r, i) => (
                <span key={`s${i}`} className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700">
                  ✓ {r}
                </span>
              ))}
              {concerns.map((r, i) => (
                <span key={`c${i}`} className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700">
                  ⚠ {r}
                </span>
              ))}
            </div>
          </div>
        )}
        {!m.proposable && m.channelNote && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            提案不可の理由: {m.channelNote}
          </div>
        )}

        {/* 元情報: スキルシート＋（開閉）案件/人材のメール本文・概要。画面遷移なしで確認。 */}
        <div className="border-t border-border pt-3">
          {/* key=pair で選択切替時に作り直して再取得する。 */}
          {/* 案件起点では案件メールは左ヘッダーに出すので右では非表示 */}
          <MatchSourceInfo
            key={`${t.id}:${p.id}`}
            talentId={t.id}
            projectId={p.id}
            showProject={groupMode !== "project"}
          />
        </div>

        {/* メール（編集して送信） */}
        <div className="border-t border-border pt-3">
          <div className="mb-2 text-xs font-semibold text-slate-500">送信メール（編集可）</div>
          {/* key=pair で人材切替時にパネルを作り直し、確実に再読込する。 */}
          <SendPanel key={`${t.id}:${p.id}`} pair={pair} controller={controller} />
        </div>
      </div>
    </Card>
  );
}
