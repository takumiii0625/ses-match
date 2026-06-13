"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import { fetchJson } from "@/lib/http";

interface PreviewData {
  to: string;
  subject: string;
  text: string;
  lastSentAt: string | null;
}

/**
 * 自社マッチ用: 案件元へ要員を提案するメールを送る。
 * クリック→プレビュー表示（モーダル）→確認して送信。雛形固定・LLMなし。
 */
export function SendTalentButton({
  talentId,
  projectId,
  projectTitle,
}: {
  talentId: string;
  projectId: string;
  projectTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mail, setMail] = useState<PreviewData | null>(null);

  async function openPreview() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<PreviewData>("/api/send-talent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId, projectId, preview: true }),
      });
      setMail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "プレビューの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!mail || sending || mail.lastSentAt) return; // 提案済みは再送不可
    setSending(true);
    setError(null);
    try {
      await fetchJson("/api/send-talent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId, projectId }),
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        disabled={sent}
        className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-border hover:bg-slate-50 hover:text-primary disabled:opacity-60"
      >
        <Send className="h-3.5 w-3.5" />
        {sent ? "提案済み" : "提案メールを送る"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => !sending && setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="text-sm font-bold text-slate-800">
                提案メールの確認{projectTitle ? ` — ${projectTitle}` : ""}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              {sent ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  ✅ {mail?.to} 宛に送信しました。
                </div>
              ) : loading ? (
                <p className="py-10 text-center text-sm text-muted">メール内容を準備中…</p>
              ) : mail ? (
                <>
                  {mail.lastSentAt && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                      ⚠️ {new Date(mail.lastSentAt).toLocaleDateString("ja-JP")}{" "}
                      に提案済みです。再送信はできません。
                    </div>
                  )}
                  <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="flex gap-2">
                      <span className="w-12 shrink-0 text-slate-400">To:</span>
                      <span className="break-all text-slate-700">{mail.to}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-12 shrink-0 text-slate-400">件名:</span>
                      <span className="break-words text-slate-700">{mail.subject}</span>
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap break-words rounded-lg border border-border p-3 text-sm leading-relaxed text-slate-700">
                    {mail.text}
                  </div>
                </>
              ) : null}
            </div>

            {!sent && mail && (
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                <button
                  onClick={() => setOpen(false)}
                  disabled={sending}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {mail.lastSentAt ? "閉じる" : "キャンセル"}
                </button>
                {!mail.lastSentAt && (
                  <button
                    onClick={send}
                    disabled={sending}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    {sending ? "送信中…" : "このメールを送信"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
