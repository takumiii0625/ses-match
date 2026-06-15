"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ImportResult } from "@/app/api/partners/import/route";

export function ImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleImport() {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/partners/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "取込に失敗しました");
      setResult(data as ImportResult);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取込に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">CSVファイル</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <p className="mt-2 text-xs text-muted">
          列: エラーカウント数 / 状態 / 氏名 / 会社名 / E-Mail（BLASTMAIL書き出し形式）
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleImport} disabled={!file || loading}>
            {loading ? "取込中…" : "取り込む"}
          </Button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </Card>

      {result && (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-700 mb-3">取込結果</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="新規連絡先" value={result.contactsCreated} />
            <Stat label="更新" value={result.contactsUpdated} />
            <Stat label="会社（触れた数）" value={result.companiesCreated} />
            <Stat label="配信中" value={result.byStatus.active} tone="green" />
            <Stat label="不達" value={result.byStatus.bounced} tone="amber" />
            <Stat label="停止" value={result.byStatus.unsubscribed} tone="slate" />
          </div>
          {result.skippedInvalid > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              不正な行を {result.skippedInvalid} 件スキップしました
              {result.errors.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs">
                  {result.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>
                      {e.line}行目: {e.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-4">
            <Link href="/partners" className="text-sm text-primary underline">
              提携先一覧を見る →
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber" | "slate";
}) {
  const color =
    tone === "green"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : "text-foreground";
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xl font-bold leading-none ${color}`}>{value}</span>
    </div>
  );
}
