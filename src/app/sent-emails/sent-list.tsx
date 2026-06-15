"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export interface SentRow {
  id: string;
  createdAt: string;
  kind: string; // PROJECT_INFO | TALENT_PROPOSAL
  status: string; // SENT | FAILED
  toAddr: string;
  subject: string;
  body: string | null;
  error: string | null;
  talentId: string;
  projectId: string;
  talentName: string | null;
  projectTitle: string | null;
}

interface Stats {
  total: number;
  todaySent: number;
  todayFailed: number;
  failedTotal: number;
}

const KIND_LABEL: Record<string, string> = {
  PROJECT_INFO: "案件案内",
  TALENT_PROPOSAL: "要員提案",
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "状態：すべて" },
  { value: "SENT", label: "送信成功のみ" },
  { value: "FAILED", label: "失敗のみ" },
];
const KIND_OPTIONS = [
  { value: "ALL", label: "種別：すべて" },
  { value: "PROJECT_INFO", label: "案件案内" },
  { value: "TALENT_PROPOSAL", label: "要員提案" },
];

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "red" }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span
        className={`text-2xl font-bold leading-none ${tone === "red" && value > 0 ? "text-red-600" : "text-foreground"}`}
      >
        {value}
      </span>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  return status === "SENT" ? (
    <Badge tone="green">✅ 送信</Badge>
  ) : (
    <Badge tone="red">❌ 失敗</Badge>
  );
}

/** 送信内容（本文）と関連リンクのパネル。展開時に表示。 */
function SentDetail({ r }: { r: SentRow }) {
  return (
    <div className="space-y-3 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href={`/compare?mode=talent&talentId=${r.talentId}`}
          className="rounded border border-border bg-white px-2 py-1 text-slate-600 hover:text-primary"
        >
          見比べで開く
        </Link>
        <Link
          href={`/talent/${r.talentId}`}
          className="rounded border border-border bg-white px-2 py-1 text-slate-600 hover:text-primary"
        >
          人材{r.talentName ? `: ${r.talentName}` : ""}
        </Link>
        <Link
          href={`/projects/${r.projectId}`}
          className="rounded border border-border bg-white px-2 py-1 text-slate-600 hover:text-primary"
        >
          案件{r.projectTitle ? `: ${r.projectTitle}` : ""}
        </Link>
      </div>
      <div className="rounded-lg border border-border bg-white p-3">
        <div className="mb-2 border-b border-border pb-2 text-xs text-muted">
          宛先: {r.toAddr}　/　件名: {r.subject}
        </div>
        {r.body ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
            {r.body}
          </div>
        ) : (
          <p className="text-sm text-muted">
            本文は記録されていません（この機能より前の送信）。件名・宛先・状態のみ確認できます。
          </p>
        )}
      </div>
    </div>
  );
}

export function SentList({ rows, stats }: { rows: SentRow[]; stats: Stats }) {
  const [status, setStatus] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (kind !== "ALL" && r.kind !== kind) return false;
      if (!q) return true;
      // 宛先・件名・人材名・案件名・本文で部分一致検索。
      return [r.toAddr, r.subject, r.talentName, r.projectTitle, r.body]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [rows, status, kind, query]);

  return (
    <div className="flex flex-col gap-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="今日の送信" value={stats.todaySent} />
        <StatCard label="今日の失敗" value={stats.todayFailed} tone="red" />
        <StatCard label="失敗（全期間）" value={stats.failedTotal} tone="red" />
        <StatCard label="記録総数" value={stats.total} />
      </div>

      {/* 検索・フィルタ */}
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[200px] flex-1">
          <Input
            placeholder="宛先・件名・人材名・案件名・本文で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
        </div>
        <div className="w-full sm:w-44">
          <Select options={KIND_OPTIONS} value={kind} onChange={(e) => setKind(e.target.value)} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted">{filtered.length}件 / 全{rows.length}件</p>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted">
          該当する送信記録がありません。
        </Card>
      ) : (
        <>
          {/* モバイル: カードリスト */}
          <div className="flex flex-col gap-3 md:hidden">
            {filtered.map((r) => (
              <Card key={r.id} className="flex flex-col gap-2 p-4">
                <button onClick={() => toggle(r.id)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={r.status} />
                    <span className="text-xs text-muted">{fmtDateTime(r.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800 break-words">{r.subject}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <Badge tone="slate">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                    <span className="break-all">宛先: {r.toAddr}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted break-words">
                    {r.talentName && <>人材: {r.talentName}　</>}
                    {r.projectTitle && <>案件: {r.projectTitle}</>}
                    <span className="ml-1 text-primary">{openId === r.id ? "▲ 閉じる" : "▼ 内容"}</span>
                  </div>
                </button>
                {r.status === "FAILED" && r.error && (
                  <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700 break-words">
                    {r.error}
                  </div>
                )}
                {openId === r.id && (
                  <div className="-mx-4 -mb-4 mt-2 border-t border-border">
                    <SentDetail r={r} />
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* デスクトップ: テーブル */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50 text-left text-xs text-muted">
                    <th className="px-4 py-3 font-medium">日時</th>
                    <th className="px-4 py-3 font-medium">種別</th>
                    <th className="px-4 py-3 font-medium">宛先</th>
                    <th className="px-4 py-3 font-medium">件名 / 対象</th>
                    <th className="px-4 py-3 font-medium">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => toggle(r.id)}
                        className="cursor-pointer border-b border-border align-top hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                          {fmtDateTime(r.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge tone="slate">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 break-all max-w-[180px]">
                          {r.toAddr}
                        </td>
                        <td className="px-4 py-3 max-w-[360px]">
                          <div className="font-medium text-slate-800 break-words">
                            {r.subject}
                            <span className="ml-2 text-xs font-normal text-primary">
                              {openId === r.id ? "▲ 閉じる" : "▼ 内容"}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted break-words">
                            {r.talentName && <>人材: {r.talentName}　</>}
                            {r.projectTitle && <>案件: {r.projectTitle}</>}
                          </div>
                          {r.status === "FAILED" && r.error && (
                            <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700 break-words">
                              {r.error}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                      {openId === r.id && (
                        <tr className="border-b border-border">
                          <td colSpan={5} className="p-0">
                            <SentDetail r={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
