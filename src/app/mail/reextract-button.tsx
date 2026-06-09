"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/http";

interface ReextractResult {
  scanned: number;
  updated: number;
  skipped: number;
  errors: number;
}

/** 既存人材の所属・性別をAIで再抽出（1回200件まで）。 */
export function ReextractButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function run() {
    setLoading(true);
    setMsg(null);
    setIsError(false);
    try {
      const data = await fetchJson<ReextractResult>(
        "/api/cron/reextract-talents?limit=200",
        { method: "POST" },
      );
      setMsg(
        `対象${data.scanned}件 → 補完${data.updated} / 変更なし${data.skipped} / エラー${data.errors}`,
      );
      router.refresh();
    } catch (e) {
      setIsError(true);
      setMsg(e instanceof Error ? e.message : "再抽出に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" onClick={run} disabled={loading}>
        {loading ? "再抽出中…" : "所属・性別を再抽出"}
      </Button>
      {msg && (
        <span className={`text-sm ${isError ? "text-red-600" : "text-slate-600"}`}>
          {msg}
        </span>
      )}
    </div>
  );
}
