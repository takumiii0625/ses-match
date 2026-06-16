"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Columns2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatRate, daysAgo } from "@/lib/utils";
import { talentDedupeKey, projectDedupeKey } from "@/lib/dedupe";
import { channelStatus } from "@/lib/channel";
import { REMOTE_LABELS } from "@/lib/enums";
import { fetchJson } from "@/lib/http";
import { ProposalButton } from "../matching/proposal-button";
import { SendProjectButton } from "../matching/send-project-button";

/** 選択キー（人材×案件）。bulk送信のペアにそのまま使う。 */
function pairKey(talentId: string, projectId: string): string {
  return `${talentId}:${projectId}`;
}

interface BulkSendResult {
  sent: number;
  skipped: number;
  failed: number;
}

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

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="mt-1 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, score)}%` }}
      />
    </div>
  );
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
  const [minScore, setMinScore] = useState("80");
  // 自社専用ページでは区分フィルタは固定（データが既に自社のみ）。
  const [talentType, setTalentType] = useState("ALL");
  // 一括送信: 選択中のペア（key→{talentId,projectId}）と送信状態。
  const [selected, setSelected] = useState<Map<string, { talentId: string; projectId: string }>>(
    new Map(),
  );
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function togglePair(talentId: string, projectId: string) {
    setSelected((cur) => {
      const next = new Map(cur);
      const k = pairKey(talentId, projectId);
      if (next.has(k)) next.delete(k);
      else next.set(k, { talentId, projectId });
      return next;
    });
  }
  function setManyPairs(pairs: { talentId: string; projectId: string }[], on: boolean) {
    setSelected((cur) => {
      const next = new Map(cur);
      for (const p of pairs) {
        const k = pairKey(p.talentId, p.projectId);
        if (on) next.set(k, p);
        else next.delete(k);
      }
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Map());
  }

  async function sendSelected() {
    if (bulkSending || selected.size === 0) return;
    const pairs = [...selected.values()];
    if (!window.confirm(`選択した ${pairs.length} 件に案件案内メールをまとめて送信します。よろしいですか？`))
      return;
    setBulkSending(true);
    setBulkMsg(null);
    try {
      const data = await fetchJson<BulkSendResult>("/api/send-project/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs }),
      });
      const parts = [`送信 ${data.sent}件`];
      if (data.skipped) parts.push(`スキップ ${data.skipped}件`);
      if (data.failed) parts.push(`失敗 ${data.failed}件`);
      setBulkMsg({ tone: data.failed ? "err" : "ok", text: parts.join(" / ") });
      clearSelection();
      // 送信済みバッジ（sentInfoAt）を反映するため再取得。
      startTransition(() => router.refresh());
    } catch (e) {
      setBulkMsg({ tone: "err", text: e instanceof Error ? e.message : "送信に失敗しました" });
    } finally {
      setBulkSending(false);
    }
  }

  // 配信日の窓はサーバ側で絞るため URL を更新して再取得する。
  function changeDays(v: string) {
    const params = new URLSearchParams();
    if (v && v !== "1") params.set("days", v);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const isFiltered =
    !!query || minScore !== "80" || (!inhouseOnly && talentType !== "ALL");

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

  // 案件ごとにグループ化。重複（同名案件/同一人材）はまとめ、最新配信を代表にする。
  const groups = useMemo(() => {
    // 案件キーごとの代表（最新配信）。
    const rep = new Map<string, { project: MatchVM["project"]; ms: number }>();
    for (const m of filtered) {
      const k = projectDedupeKey(m.project.title, m.project.clientName);
      const ms = m.project.receivedDate ? Date.parse(m.project.receivedDate) : 0;
      const cur = rep.get(k);
      if (!cur || ms > cur.ms) rep.set(k, { project: m.project, ms });
    }
    // 案件キーでまとめ、各グループ内で人材キーごとに最新を代表に。
    const byKey = new Map<
      string,
      { project: MatchVM["project"]; talents: Map<string, { m: MatchVM; ms: number; dupes: number }> }
    >();
    for (const m of filtered) {
      const pk = projectDedupeKey(m.project.title, m.project.clientName);
      let g = byKey.get(pk);
      if (!g) {
        g = { project: rep.get(pk)!.project, talents: new Map() };
        byKey.set(pk, g);
      }
      const tk = talentDedupeKey(m.talent.name, m.talent.mainSkills);
      const ms = m.talent.receivedDate ? Date.parse(m.talent.receivedDate) : 0;
      const cur = g.talents.get(tk);
      if (!cur) g.talents.set(tk, { m, ms, dupes: 1 });
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
        project: g.project,
        rows: [...g.talents.values()]
          .map((x) => ({ m: x.m, dupes: x.dupes }))
          .sort((a, b) => b.m.score - a.m.score),
      }))
      .sort((a, b) => (b.rows[0]?.m.score ?? 0) - (a.rows[0]?.m.score ?? 0));
  }, [filtered]);

  const shownCount = useMemo(
    () => groups.reduce((n, g) => n + g.rows.length, 0),
    [groups],
  );

  return (
    <div className="space-y-4">
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
        <div className="min-w-[240px] flex-1">
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
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">区分</label>
            <Select
              options={TYPE_OPTIONS}
              value={talentType}
              onChange={(e) => setTalentType(e.target.value)}
            />
          </div>
        )}
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-slate-500">点数</label>
          <Select
            options={SCORE_OPTIONS}
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
          />
        </div>
        {!inhouseOnly && (
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">配信日</label>
            <Select
              options={DAYS_OPTIONS}
              value={days}
              onChange={(e) => changeDays(e.target.value)}
            />
          </div>
        )}
        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setMinScore("80");
              setTalentType("ALL");
            }}
            className="h-10 text-sm text-slate-500 underline hover:text-slate-700"
          >
            クリア
          </button>
        )}
      </Card>

      {bulkMsg && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            bulkMsg.tone === "err"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          一括送信の結果: {bulkMsg.text}
        </div>
      )}

      <div className="px-1 text-sm font-medium text-muted">
        {shownCount} 件のマッチ（{groups.length} 案件・重複まとめ後）
        {filtered.length !== matches.length && (
          <span className="ml-1 text-xs">/ 全 {matches.length} 件中</span>
        )}
      </div>

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
        <div className="space-y-6">
          {groups.map(({ project, rows }) => {
            // この案件グループ内で未送信＝一括送信できる行。
            const sendableRows = rows.filter(({ m }) => !m.sentInfoAt);
            const sendablePairs = sendableRows.map(({ m }) => ({
              talentId: m.talent.id,
              projectId: project.id,
            }));
            const allGroupSelected =
              sendablePairs.length > 0 &&
              sendablePairs.every((p) => selected.has(pairKey(p.talentId, p.projectId)));
            return (
            <Card key={project.id} className="overflow-hidden p-0">
              {/* 案件ヘッダー */}
              <div className="border-b border-border bg-slate-50/60 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {sendablePairs.length > 0 && (
                    <label
                      className="inline-flex items-center"
                      title="この案件の未送信マッチをすべて選択"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={allGroupSelected}
                        onChange={() => setManyPairs(sendablePairs, !allGroupSelected)}
                      />
                    </label>
                  )}
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-semibold text-foreground hover:text-primary hover:underline"
                  >
                    {project.title}
                  </Link>
                  <Badge tone="slate">{rows.length}名マッチ</Badge>
                  {project.clientName && (
                    <span className="text-xs text-muted">
                      クライアント: {project.clientName}
                    </span>
                  )}
                  {(project.rateMin != null || project.rateMax != null) && (
                    <span className="text-xs text-muted">
                      単価: {formatRate(project.rateMin, project.rateMax)}
                    </span>
                  )}
                  <span className="text-xs text-muted">配信: {daysAgo(project.receivedDate)}</span>
                  <Link
                    href={`/compare?mode=project&projectId=${project.id}`}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-border hover:bg-slate-50 hover:text-primary"
                  >
                    <Columns2 className="h-3.5 w-3.5" /> 見比べる
                  </Link>
                </div>
                {(project.channelText || project.supportFee) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted">商流:</span>
                    {project.channelText && (
                      <Badge tone="amber">{project.channelText}</Badge>
                    )}
                    {project.supportFee && <Badge tone="green">支援費あり</Badge>}
                  </div>
                )}
                {project.requiredSkills.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-xs text-muted">必須スキル:</span>
                    {project.requiredSkills.map((s) => (
                      <Badge key={s} tone="indigo">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* マッチ人材 */}
              <div className="divide-y divide-border">
                {rows.map(({ m, dupes }) => {
                  const { strengths, concerns } = splitReasons(m.reasons);
                  const t = m.talent;
                  const isSent = !!m.sentInfoAt;
                  const isSelected = selected.has(pairKey(t.id, project.id));
                  return (
                    <div
                      key={m.id}
                      className={`flex items-start gap-4 px-5 py-4 ${isSelected ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex w-5 shrink-0 justify-center pt-1">
                        {isSent ? (
                          <span className="text-emerald-500" title="送信済み">✓</span>
                        ) : (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={isSelected}
                            onChange={() => togglePair(t.id, project.id)}
                            title="一括送信に選択"
                          />
                        )}
                      </div>
                      <div className="w-14 shrink-0 text-center">
                        <div className="text-lg font-bold tabular-nums text-slate-700">
                          {Math.round(m.score)}
                          <span className="text-xs font-normal text-slate-400">点</span>
                        </div>
                        <ScoreBar score={m.score} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/talent/${t.id}`}
                            className="font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {t.name}
                          </Link>
                          <Badge tone={scoreBadgeTone(m.score)} className="tabular-nums">
                            {Math.round(m.score)}点
                          </Badge>
                          {(() => {
                            const cs = channelStatus(m.proposable, m.channelNote);
                            return cs ? <Badge tone={cs.tone}>{cs.label}</Badge> : null;
                          })()}
                          {m.locationOk === true && <Badge tone="green">勤務地・勤務形態OK</Badge>}
                          {dupes > 1 && <Badge tone="slate">同一{dupes}件</Badge>}
                          {(t.desiredRateMin != null || t.desiredRateMax != null) && (
                            <span className="text-xs text-muted">
                              希望単価: {formatRate(t.desiredRateMin, t.desiredRateMax)}
                            </span>
                          )}
                          {t.remotePreference && (
                            <span className="text-xs text-muted">
                              {REMOTE_LABELS[t.remotePreference] ?? t.remotePreference}
                            </span>
                          )}
                          {t.affiliation && (
                            <span className="text-xs text-muted">所属: {t.affiliation}</span>
                          )}
                          <span className="text-xs text-muted">配信: {daysAgo(t.receivedDate)}</span>
                        </div>

                        {/* スキル */}
                        {(t.mainSkills.length > 0 || t.skills.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {t.mainSkills.map((s) => (
                              <Badge key={s} tone="blue">
                                {s}
                              </Badge>
                            ))}
                            {t.skills
                              .filter((s) => !t.mainSkills.includes(s))
                              .slice(0, 6)
                              .map((s) => (
                                <Badge key={s} tone="slate">
                                  {s}
                                </Badge>
                              ))}
                          </div>
                        )}

                        {/* マッチ根拠（何を基準にマッチしたか） */}
                        {strengths.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {strengths.map((r, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700"
                              >
                                ✓ {r}
                              </span>
                            ))}
                          </div>
                        )}
                        {concerns.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {concerns.map((r, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700"
                              >
                                ⚠ {r}
                              </span>
                            ))}
                          </div>
                        )}
                        {strengths.length === 0 && concerns.length === 0 && (
                          <p className="mt-2 text-xs text-slate-400">
                            判定根拠は記録されていません。
                          </p>
                        )}
                        {m.channelNote &&
                          (m.proposable ? (
                            <p className="mt-2 text-xs text-slate-500">商流: {m.channelNote}</p>
                          ) : (
                            <div className="mt-2">
                              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs text-red-700">
                                提案不可の理由: {m.channelNote}
                              </span>
                            </div>
                          ))}

                        {/* アクション: 提案へ進む / 見比べる */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {m.sentInfoAt && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              ✉ 送信済み {fmtSentDate(m.sentInfoAt)}
                            </span>
                          )}
                          <ProposalButton talentId={t.id} projectId={project.id} />
                          <SendProjectButton
                            talentId={t.id}
                            projectId={project.id}
                            talentName={t.name}
                          />
                          <Link
                            href={`/compare?mode=talent&talentId=${t.id}`}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-border hover:bg-slate-50 hover:text-primary"
                          >
                            <Columns2 className="h-3.5 w-3.5" /> この人材を見比べ
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
            );
          })}
        </div>
      )}

      {/* 一括送信バー（選択中のみ表示・画面下部に固定） */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-full border border-border bg-white px-5 py-3 shadow-lg">
          <span className="text-sm font-medium text-slate-700">{selected.size} 件選択中</span>
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkSending}
            className="text-xs text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
          >
            選択解除
          </button>
          <button
            type="button"
            onClick={sendSelected}
            disabled={bulkSending}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {bulkSending ? "送信中…" : `選択した ${selected.size} 件を送信`}
          </button>
        </div>
      )}
    </div>
  );
}
