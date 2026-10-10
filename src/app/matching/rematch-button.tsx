"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useMatchJob } from "@/components/match-job";

const PERIOD_OPTIONS = [
  { value: "1", label: "今日のみ" },
  { value: "2", label: "過去2日" },
  { value: "3", label: "過去3日" },
  { value: "7", label: "過去7日" },
];

/**
 * 手動マッチの起動ボタン。実際のループ・進捗はレイアウト直下の MatchJob(context) が保持するため、
 * 実行中に画面を切り替えても処理と進捗（右下トースト）は消えない。
 * scope="inhouse"/"registered" で候補を自社保有に限定（他社のマッチは保持）。
 */
export function RematchButton({
  scope = "all",
  label,
  defaultDays = "1",
  projectCounts,
}: {
  scope?: "all" | "inhouse" | "registered";
  label?: string;
  defaultDays?: string;
  // 期間(days文字列) → その期間に取り込まれた対象案件数。選択中の件数を表示する。
  projectCounts?: Record<string, number>;
} = {}) {
  const { job, start } = useMatchJob();
  const runLabel =
    label ?? (scope === "inhouse" ? "自社人材でマッチを実行" : "全件マッチを今すぐ実行");
  const [days, setDays] = useState(defaultDays);
  // 全件再判定: ON=既判定ペアも含め再評価（プロンプト/設定変更の反映。重い）。OFF(既定)=未判定のみ＝速い。
  const [full, setFull] = useState(false);

  const anyRunning = !!job?.running;
  const thisRunning = anyRunning && job?.scope === scope;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-32">
          <Select
            options={PERIOD_OPTIONS}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={anyRunning}
            aria-label="対象期間"
          />
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={() => start({ scope, days, full, label: runLabel })}
          disabled={anyRunning}
        >
          {thisRunning ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              実行中… {job?.percent ?? 0}%
            </span>
          ) : anyRunning ? (
            "別のマッチを実行中…"
          ) : (
            runLabel
          )}
        </Button>
        {/* 選択中の期間に取り込まれた対象案件数 */}
        {!anyRunning && projectCounts && (
          <span className="text-sm text-muted">
            対象案件: <span className="font-semibold text-slate-700">{projectCounts[days] ?? 0}</span> 件
          </span>
        )}
      </div>

      {/* 全件再判定（重い）。既定OFF＝未判定ペアだけ判定で速い。 */}
      <label className="flex items-center gap-2 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={full}
          onChange={(e) => setFull(e.target.checked)}
          disabled={anyRunning}
          className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary"
        />
        全件を再判定する（プロンプト/マッチ設定を変えた時だけ。既定は未判定分のみで高速）
      </label>

      <p className="text-xs text-slate-400">
        実行中に別の画面へ移動しても処理は止まりません（右下に進捗が表示されます）。
      </p>
    </div>
  );
}
