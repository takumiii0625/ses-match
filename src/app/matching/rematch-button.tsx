"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/http";

interface RematchPageResult {
  totalProjects: number;
  processed: number;
  done: boolean;
  talents: number;
  saved: number;
  errors: number;
  minScore: number;
}

// 1リクエストで処理する案件数。小さいほど各リクエストが短く＝タイムアウトしない。
const CHUNK = 3;

/**
 * 全人材 × 全案件を一括マッチ（/api/cron/rematch）。
 * 案件を少しずつ分割して呼び出し、完了まで繰り返す。
 * 各リクエストが短いのでタイムアウトせず、進捗をパーセンテージで表示できる。
 */
export function RematchButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleRun() {
    if (running) return;
    setRunning(true);
    setMsg(null);
    setIsError(false);
    setPercent(0);
    try {
      let offset = 0;
      let saved = 0;
      let errors = 0;
      let total = 0;
      let talents = 0;
      for (;;) {
        const data = await fetchJson<RematchPageResult>(
          `/api/cron/rematch?offset=${offset}&limit=${CHUNK}`,
          { method: "POST" },
        );
        total = data.totalProjects;
        talents = data.talents;
        saved += data.saved;
        errors += data.errors;

        const pct = total > 0 ? Math.round((data.processed / total) * 100) : 100;
        setPercent(pct);

        if (data.done) {
          setMsg(
            `完了：${saved}件を保存（${total}案件 × ${talents}人材／${data.minScore}点以上）` +
              (errors > 0 ? `／${errors}案件は判定失敗` : ""),
          );
          router.refresh();
          break;
        }
        setMsg(`実行中… ${data.processed}/${total}案件 ・ 保存${saved}件`);
        offset = data.processed;
      }
    } catch (e) {
      setIsError(true);
      setMsg(e instanceof Error ? e.message : "全件マッチに失敗しました");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="md" onClick={handleRun} disabled={running}>
          {running ? `実行中… ${percent ?? 0}%` : "全件マッチを今すぐ実行"}
        </Button>
        {msg && (
          <span
            className={`text-sm font-medium ${isError ? "text-red-600" : "text-emerald-600"}`}
          >
            {msg}
          </span>
        )}
      </div>

      {/* 進捗バー（パーセンテージ） */}
      {running && percent !== null && (
        <div className="flex items-center gap-2">
          <div className="h-2 max-w-md flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-slate-500">
            {percent}%
          </span>
        </div>
      )}
    </div>
  );
}
