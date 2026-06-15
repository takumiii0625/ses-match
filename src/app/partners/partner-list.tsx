"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Upload, Send, Plus } from "lucide-react";

export interface PartnerRow {
  id: string;
  name: string;
  industry: string | null;
  domain: string | null;
  tags: string[];
  contactCount: number;
  activeCount: number;
  bouncedCount: number;
  unsubCount: number;
  createdAt: string;
}

interface Stats {
  companies: number;
  active: number;
  bounced: number;
  unsub: number;
  newToday: number;
  newWeek: number;
  newMonth: number;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

const STATUS_OPTIONS = [
  { value: "", label: "連絡先状態：すべて" },
  { value: "ACTIVE", label: "配信中を含む" },
  { value: "BOUNCED", label: "不達を含む" },
  { value: "UNSUBSCRIBED", label: "停止を含む" },
];

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "slate" }) {
  const color =
    tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-foreground";
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={`text-2xl font-bold leading-none ${color}`}>{value}</span>
    </Card>
  );
}

export function PartnerList({
  rows,
  stats,
  initialQuery,
  initialStatus,
}: {
  rows: PartnerRow[];
  stats: Stats;
  initialQuery: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);

  function apply(next: { query?: string; status?: string }) {
    const params = new URLSearchParams();
    const q = next.query ?? query;
    const s = next.status ?? status;
    if (q) params.set("query", q);
    if (s) params.set("status", s);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="提携先会社" value={stats.companies} />
        <StatCard label="配信中" value={stats.active} tone="green" />
        <StatCard label="不達" value={stats.bounced} tone="amber" />
        <StatCard label="配信停止" value={stats.unsub} tone="slate" />
      </div>

      {/* 新規追加の推移 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border bg-slate-50 px-4 py-2.5 text-sm">
        <span className="font-medium text-slate-600">新規追加</span>
        <span className="text-slate-700">
          今日 <span className="font-bold text-emerald-600">{stats.newToday}</span> 社
        </span>
        <span className="text-slate-700">
          直近7日 <span className="font-bold text-emerald-600">{stats.newWeek}</span> 社
        </span>
        <span className="text-slate-700">
          今月 <span className="font-bold text-emerald-600">{stats.newMonth}</span> 社
        </span>
      </div>

      {/* ツールバー */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply({});
          }}
          className="flex flex-1 min-w-[200px] gap-2"
        >
          <Input
            placeholder="会社名・メール・メモで検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        <div className="w-44">
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              apply({ status: e.target.value });
            }}
          />
        </div>
        <Link
          href="/partners/new"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" /> 新規
        </Link>
        <Link
          href="/partners/import"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Upload className="h-4 w-4" /> CSV取込
        </Link>
        <Link
          href="/partners/blast"
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Send className="h-4 w-4" /> 一斉案内
        </Link>
      </div>

      <p className="text-xs text-muted">{rows.length}社を表示</p>

      {rows.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted">
          提携先がありません。
          <Link href="/partners/import" className="ml-1 text-primary underline">
            CSVを取り込む
          </Link>
        </Card>
      ) : (
        <>
          {/* モバイル: カード */}
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <Link key={r.id} href={`/partners/${r.id}`}>
                <Card className="p-4 hover:bg-slate-50">
                  <div className="font-medium text-slate-800 break-words">{r.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    {r.industry && <Badge tone="slate">{r.industry}</Badge>}
                    <Badge tone="green">配信中 {r.activeCount}</Badge>
                    {r.bouncedCount > 0 && <Badge tone="amber">不達 {r.bouncedCount}</Badge>}
                    {r.unsubCount > 0 && <Badge tone="slate">停止 {r.unsubCount}</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted">登録 {fmtDate(r.createdAt)}</div>
                </Card>
              </Link>
            ))}
          </div>

          {/* デスクトップ: テーブル */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50 text-left text-xs text-muted">
                    <th className="px-4 py-3 font-medium">会社名</th>
                    <th className="px-4 py-3 font-medium">業種</th>
                    <th className="px-4 py-3 font-medium">ドメイン</th>
                    <th className="px-4 py-3 font-medium">連絡先</th>
                    <th className="px-4 py-3 font-medium">配信中 / 不達 / 停止</th>
                    <th className="px-4 py-3 font-medium">登録日</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/partners/${r.id}`} className="font-medium text-slate-800 hover:text-primary hover:underline break-words">
                          {r.name}
                        </Link>
                        {r.tags.length > 0 && (
                          <span className="ml-2 inline-flex gap-1">
                            {r.tags.slice(0, 3).map((t) => (
                              <Badge key={t} tone="indigo">{t}</Badge>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.industry ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.domain ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{r.contactCount}</td>
                      <td className="px-4 py-3 text-xs tabular-nums">
                        <span className="text-emerald-600">{r.activeCount}</span>
                        {" / "}
                        <span className="text-amber-600">{r.bouncedCount}</span>
                        {" / "}
                        <span className="text-slate-500">{r.unsubCount}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                        {fmtDate(r.createdAt)}
                      </td>
                    </tr>
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
