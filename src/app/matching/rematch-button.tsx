"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface RematchResult {
  projects: number;
  talents: number;
  pairs: number;
  saved: number;
  errors: number;
  minScore: number;
  error?: string;
}

/**
 * 全人材 × 全案件を今すぐ一括マッチ（/api/cron/rematch を起動）。
 * LLM判定のため案件数に応じて時間がかかる。
 */
export function RematchButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleRun() {
    if (running) return;
    setRunning(true);
    setMsg(null);
    setIsError(false);
    try {
      const res = await fetch("/api/cron/rematch", { method: "POST" });
      const data = (await res.json()) as RematchResult;
      if (!res.ok) throw new Error(data.error ?? `エラー: ${res.status}`);
      setMsg(
        `${data.saved}件を保存（${data.projects}案件 × ${data.talents}人材／${data.minScore}点以上）` +
          (data.errors > 0 ? `／${data.errors}案件は判定失敗` : ""),
      );
      router.refresh();
    } catch (e) {
      setIsError(true);
      setMsg(e instanceof Error ? e.message : "全件マッチに失敗しました");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button variant="secondary" size="md" onClick={handleRun} disabled={running}>
        {running ? "実行中…（数分かかる場合があります）" : "全件マッチを今すぐ実行"}
      </Button>
      {msg && (
        <span
          className={`text-sm font-medium ${isError ? "text-red-600" : "text-emerald-600"}`}
        >
          {msg}
        </span>
      )}
    </div>
  );
}
