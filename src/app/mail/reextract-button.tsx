"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/http";

interface ReextractResult {
  total: number;
  processed: number;
  done: boolean;
  updated: number;
  skipped: number;
  errors: number;
}

// 1リクエストで処理する人材数。小さいほど各リクエストが短く＝タイムアウトしない。
const CHUNK = 6;

/** 既存人材の所属・性別をAIで再抽出。少しずつ分割して完了まで繰り返す。 */
export function ReextractButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function run() {
    if (running) return;
    setRunning(true);
    setMsg(null);
    setIsError(false);
    setPercent(0);
    try {
      let offset = 0;
      let updated = 0;
      let errors = 0;
      let total = 0;
      for (;;) {
        const data = await fetchJson<ReextractResult>(
          `/api/cron/reextract-talents?offset=${offset}&limit=${CHUNK}`,
          { method: "POST" },
        );
        total = data.total;
        updated += data.updated;
        errors += data.errors;
        const pct = total > 0 ? Math.round((data.processed / total) * 100) : 100;
        setPercent(pct);

        if (data.done) {
          setMsg(
            `完了：対象${total}件 → 補完${updated}件` +
              (errors > 0 ? ` / エラー${errors}` : ""),
          );
          router.refresh();
          break;
        }
        setMsg(`再抽出中… ${data.processed}/${total}件 ・ 補完${updated}件`);
        offset = data.processed;
      }
    } catch (e) {
      setIsError(true);
      setMsg(e instanceof Error ? e.message : "再抽出に失敗しました");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={run} disabled={running}>
          {running ? `再抽出中… ${percent ?? 0}%` : "所属・性別を再抽出"}
        </Button>
        {msg && (
          <span className={`text-sm ${isError ? "text-red-600" : "text-slate-600"}`}>
            {msg}
          </span>
        )}
      </div>
      {running && percent !== null && (
        <div className="flex items-center gap-2">
          <div className="h-2 max-w-md flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">
            {percent}%
          </span>
        </div>
      )}
    </div>
  );
}
