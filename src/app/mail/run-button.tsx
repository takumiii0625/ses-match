"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function RunButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cron/fetch-mail?limit=200", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取り込みに失敗しました");
      setMsg(
        `取得${data.fetched}件 → 人材${data.created.talent} / 案件${data.created.project} / 対象外${data.ignored} / 重複${data.skipped} / エラー${data.errors}`,
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={disabled || loading}>
        <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {loading ? "取り込み中…" : "今すぐ取り込み"}
      </Button>
      {msg && <span className="text-sm text-slate-600">{msg}</span>}
    </div>
  );
}
