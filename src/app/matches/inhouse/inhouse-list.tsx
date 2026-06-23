"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatRate, daysAgo } from "@/lib/utils";
import { REMOTE_LABELS } from "@/lib/enums";
import { inhouseChannelStatus } from "@/lib/channel";
import { fetchJson } from "@/lib/http";
import { ProposalButton } from "../../matching/proposal-button";
import { SendProjectButton } from "../../matching/send-project-button";
import { SendTalentButton } from "../../matching/send-talent-button";
import { fmtSentDate } from "../matches-list";
import { groupByTalent } from "./group";
import type { MatchVM } from "../matches-list";

/** 選択キー（人材×案件）。bulk送信のペアにそのまま使う。 */
function pairKey(talentId: string, projectId: string): string {
  return `${talentId}:${projectId}`;
}
interface BulkSendResult {
  sent: number;
  skipped: number;
  failed: number;
}

const SCORE_OPTIONS = [
  { value: "70", label: "70点以上" },
  { value: "75", label: "75点以上" },
  { value: "80", label: "80点以上" },
  { value: "90", label: "90点以上" },
];
const CHANNEL_OPTIONS = [
  { value: "ALL", label: "商流：すべて" },
  { value: "OK", label: "提案可のみ" },
  { value: "NG", label: "提案不可のみ" },
];

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

/** 自社マッチ：自社人材を起点に、その人にマッチした案件を一覧表示。 */
export function InhouseMatchesList({ matches }: { matches: MatchVM[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState("75");
  const [channel, setChannel] = useState("ALL");
  // 一括送信: 選択中のペアと送信状態。
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

  // 選択分を、指定エンドポイント（要員提案 or 案件案内）でまとめて送信する。
  async function sendSelected(endpoint: string, label: string) {
    if (bulkSending || selected.size === 0) return;
    const pairs = [...selected.values()];
    if (!window.confirm(`選択した ${pairs.length} 件に「${label}」をまとめて送信します。よろしいですか？`))
      return;
    setBulkSending(true);
    setBulkMsg(null);
    try {
      const data = await fetchJson<BulkSendResult>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs }),
      });
      const parts = [`送信 ${data.sent}件`];
      if (data.skipped) parts.push(`スキップ ${data.skipped}件`);
      if (data.failed) parts.push(`失敗 ${data.failed}件`);
      setBulkMsg({ tone: data.failed ? "err" : "ok", text: `${label}: ${parts.join(" / ")}` });
      clearSelection();
      startTransition(() => router.refresh());
    } catch (e) {
      setBulkMsg({ tone: "err", text: e instanceof Error ? e.message : "送信に失敗しました" });
    } finally {
      setBulkSending(false);
    }
  }

  const isFiltered = !!query || minScore !== "75" || channel !== "ALL";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Number(minScore);
    return matches.filter((m) => {
      if (m.score < min) return false;
      if (channel === "OK" && !m.proposable) return false;
      if (channel === "NG" && m.proposable) return false;
      if (!q) return true;
      const hay = [
        m.talent.name,
        ...m.talent.mainSkills,
        ...m.talent.skills,
        m.project.title,
        m.project.clientName ?? "",
        ...m.project.requiredSkills,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [matches, query, minScore, channel]);

  // 自社人材ごとにグループ化（ロジックは ./group の純関数に切り出し・テスト済み）。
  const groups = useMemo(() => groupByTalent(filtered), [filtered]);

  const shownTalents = groups.length;

  return (
    <div className="space-y-4">
      {/* スコープ切替タブ */}
      <div className="flex gap-1 border-b border-border">
        <Link
          href="/matches"
          className="rounded-t-lg px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          すべてのマッチ
        </Link>
        <Link
          href="/matches/inhouse"
          className="rounded-t-lg border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary"
        >
          自社保有人材のマッチ
        </Link>
      </div>

      {/* フィルタ */}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[240px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            人材名・案件名・スキルで検索
          </label>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: 田中 / Java / ◯◯案件"
          />
        </div>
        <div className="w-36">
          <label className="mb-1 block text-xs font-medium text-slate-500">商流</label>
          <Select options={CHANNEL_OPTIONS} value={channel} onChange={(e) => setChannel(e.target.value)} />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-slate-500">点数</label>
          <Select options={SCORE_OPTIONS} value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        </div>
        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setMinScore("75");
              setChannel("ALL");
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
        {shownTalents} 名の自社人材にマッチ（重複まとめ後）
      </div>

      {groups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          自社保有人材のマッチがありません。上の「自社人材でマッチを実行」を押すと、
          自社人材 × 案件のマッチを計算して保存します。
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ talent, rows }) => {
            // この人材グループ内の全マッチを一括選択対象にする（送信スキップは送信時に種別ごと判定）。
            const groupPairs = rows.map(({ m }) => ({
              talentId: talent.id,
              projectId: m.project.id,
            }));
            const allGroupSelected =
              groupPairs.length > 0 &&
              groupPairs.every((p) => selected.has(pairKey(p.talentId, p.projectId)));
            return (
            <Card key={talent.id} className="overflow-hidden p-0">
              {/* 人材ヘッダー */}
              <div className="border-b border-border bg-slate-50/60 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {groupPairs.length > 0 && (
                    <label className="inline-flex items-center" title="この人材のマッチをすべて選択">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={allGroupSelected}
                        onChange={() => setManyPairs(groupPairs, !allGroupSelected)}
                      />
                    </label>
                  )}
                  <Link
                    href={`/talent/${talent.id}`}
                    className="font-semibold text-foreground hover:text-primary hover:underline"
                  >
                    {talent.name}
                  </Link>
                  <Badge tone="slate">{rows.length}件の案件にマッチ</Badge>
                  <span className="text-xs text-muted">所属: {talent.affiliation ?? "-"}</span>
                  {(talent.desiredRateMin != null || talent.desiredRateMax != null) && (
                    <span className="text-xs text-muted">
                      希望単価: {formatRate(talent.desiredRateMin, talent.desiredRateMax)}
                    </span>
                  )}
                  {talent.remotePreference && (
                    <span className="text-xs text-muted">
                      {REMOTE_LABELS[talent.remotePreference] ?? talent.remotePreference}
                    </span>
                  )}
                </div>
                {(talent.mainSkills.length > 0 || talent.skills.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {talent.mainSkills.map((s) => (
                      <Badge key={s} tone="blue">{s}</Badge>
                    ))}
                    {talent.skills
                      .filter((s) => !talent.mainSkills.includes(s))
                      .slice(0, 6)
                      .map((s) => (
                        <Badge key={s} tone="slate">{s}</Badge>
                      ))}
                  </div>
                )}
              </div>

              {/* マッチ案件 */}
              <div className="divide-y divide-border">
                {rows.map(({ m, dupes }) => {
                  const { strengths, concerns } = splitReasons(m.reasons);
                  const p = m.project;
                  const cs = inhouseChannelStatus(m.proposable, m.channelNote);
                  const isSelected = selected.has(pairKey(talent.id, p.id));
                  return (
                    <div
                      key={m.id}
                      className={`flex items-start gap-4 px-5 py-4 ${isSelected ? "bg-primary/5" : ""}`}
                    >
                      <div className="flex w-5 shrink-0 justify-center pt-1">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={isSelected}
                          onChange={() => togglePair(talent.id, p.id)}
                          title="一括送信に選択"
                        />
                      </div>
                      <div className="w-12 shrink-0 text-center">
                        <div className="text-lg font-bold tabular-nums text-slate-700">
                          {Math.round(m.score)}
                          <span className="text-xs font-normal text-slate-400">点</span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/projects/${p.id}`}
                            className="font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {p.title}
                          </Link>
                          <Badge tone={scoreTone(m.score)} className="tabular-nums">
                            {Math.round(m.score)}点
                          </Badge>
                          {cs && <Badge tone={cs.tone}>{cs.label}</Badge>}
                          {m.locationOk === true && <Badge tone="green">勤務地・勤務形態OK</Badge>}
                          {m.sentTalentAt && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              ✉ 提案済み {fmtSentDate(m.sentTalentAt)}
                            </span>
                          )}
                          {m.sentInfoAt && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                              ✉ 案内済み {fmtSentDate(m.sentInfoAt)}
                            </span>
                          )}
                          {dupes > 1 && <Badge tone="slate">同一{dupes}件</Badge>}
                          {p.clientName && (
                            <span className="text-xs text-muted">クライアント: {p.clientName}</span>
                          )}
                          <span className="text-xs text-muted">配信: {daysAgo(p.receivedDate)}</span>
                        </div>

                        {(p.channelText || p.supportFee) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted">商流:</span>
                            {p.channelText && <Badge tone="amber">{p.channelText}</Badge>}
                            {p.supportFee && <Badge tone="green">支援費あり</Badge>}
                          </div>
                        )}

                        {p.requiredSkills.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {p.requiredSkills.map((s) => (
                              <Badge key={s} tone="indigo">{s}</Badge>
                            ))}
                          </div>
                        )}

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
                        {!m.proposable && m.channelNote && (
                          <div className="mt-2">
                            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs text-red-700">
                              提案不可の理由: {m.channelNote}
                            </span>
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <ProposalButton talentId={talent.id} projectId={p.id} />
                          <SendTalentButton
                            talentId={talent.id}
                            projectId={p.id}
                            projectTitle={p.title}
                          />
                          <SendProjectButton
                            talentId={talent.id}
                            projectId={p.id}
                            talentName={talent.name}
                          />
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

      {/* 一括送信バー（選択中のみ表示・画面下部に固定）。両方のメール種別を選んで送れる。 */}
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
            onClick={() => sendSelected("/api/send-talent/bulk", "要員提案メール")}
            disabled={bulkSending}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {bulkSending ? "送信中…" : "要員提案をまとめて送信"}
          </button>
          <button
            type="button"
            onClick={() => sendSelected("/api/send-project/bulk", "案件案内メール")}
            disabled={bulkSending}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {bulkSending ? "送信中…" : "案件案内をまとめて送信"}
          </button>
        </div>
      )}
    </div>
  );
}
