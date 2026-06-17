"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

/** 差し戻し学習: 差し戻し理由から「避けるべきマッチ傾向」を分析し、マッチ判定に自動反映。
 *  差し戻しのたびに自動更新（都度反映）。ここでは内容確認・手動再分析・クリアができる。 */
export function RejectionLearnings({
  learnings,
  updatedAt,
}: {
  learnings: string | null;
  updatedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"analyze" | "clear" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function run(method: "POST" | "DELETE", which: "analyze" | "clear") {
    if (busy) return;
    if (which === "clear" && !window.confirm("学習メモを消して、マッチ判定への反映を止めますか？")) return;
    setBusy(which);
    setMsg(null);
    try {
      const res = await fetch("/api/match-learnings", { method });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "失敗しました");
      setMsg({
        tone: "ok",
        text: which === "analyze" ? `差し戻し ${data.count}件を分析して反映しました` : "反映を止めました",
      });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "失敗しました" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-slate-700">差し戻し学習（マッチ判定に反映）</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => run("POST", "analyze")}
            disabled={busy !== null}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {busy === "analyze" ? "分析中…" : "今すぐ再分析して反映"}
          </button>
          {learnings && (
            <button
              type="button"
              onClick={() => run("DELETE", "clear")}
              disabled={busy !== null}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              クリア
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        差し戻し理由から「避けるべきマッチ傾向」を分析し、該当マッチを<span className="font-medium text-slate-700">提案不可（除外）</span>にします。
        <span className="font-medium text-slate-700">差し戻すたびに自動で更新</span>されます（状況依存・一回限りの理由は除外）。
      </p>

      {msg && (
        <p className={`text-xs ${msg.tone === "err" ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>
      )}

      {learnings ? (
        <div className="rounded-lg border border-border bg-slate-50 p-3">
          <div className="mb-1 text-[11px] text-muted">
            現在反映中の学習{updatedAt ? `（更新: ${new Date(updatedAt).toLocaleString("ja-JP")}）` : ""}
          </div>
          <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-700">
            {learnings}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          まだ学習はありません。差し戻すと自動で作成・反映されます（または「今すぐ再分析」）。
        </p>
      )}
    </Card>
  );
}
