"use client";

import { useState } from "react";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function unsubscribe() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "停止に失敗しました");
      setState("done");
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "停止に失敗しました");
    }
  }

  if (state === "done") {
    return (
      <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        配信を停止しました。ご利用ありがとうございました。
      </p>
    );
  }

  return (
    <div className="mt-5">
      <button
        onClick={unsubscribe}
        disabled={state === "loading"}
        className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
      >
        {state === "loading" ? "処理中…" : "配信を停止する"}
      </button>
      {state === "error" && msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
    </div>
  );
}
