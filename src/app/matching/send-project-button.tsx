"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { fetchJson } from "@/lib/http";

/** マッチした人材に、その案件の案内メールを送る（Resend）。送信は外部送信なので確認つき。 */
export function SendProjectButton({
  talentId,
  projectId,
  talentName,
}: {
  talentId: string;
  projectId: string;
  talentName?: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (state === "sending") return;
    const ok = window.confirm(
      `${talentName ?? "この人材"} に案件の案内メールを送信します。よろしいですか？`,
    );
    if (!ok) return;
    setState("sending");
    setMsg(null);
    try {
      const data = await fetchJson<{ to: string }>("/api/send-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId, projectId }),
      });
      setState("sent");
      setMsg(`送信しました（${data.to}）`);
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "送信に失敗しました");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={state === "sending" || state === "sent"}
        className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-border hover:bg-slate-50 hover:text-primary disabled:opacity-60"
      >
        <Send className="h-3.5 w-3.5" />
        {state === "sending" ? "送信中…" : state === "sent" ? "送信済み" : "案件を送る"}
      </button>
      {msg && (
        <span className={`text-xs ${state === "error" ? "text-red-600" : "text-emerald-600"}`}>
          {msg}
        </span>
      )}
    </span>
  );
}
