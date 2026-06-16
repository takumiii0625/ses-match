"use client";

// 案件案内メールの「編集・単体送信・一括読込・一斉送信」を統括する共有ロジック。
// 見比べ画面とマッチ一覧の両方から使う（画面遷移なしでメール確認→送信できる）。
import { useEffect, useRef, useState } from "react";

export type SendPair = { talentId: string; projectId: string };

export function pairKey(p: SendPair): string {
  return `${p.talentId}:${p.projectId}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export interface MailState {
  to: string;
  subject: string;
  text: string;
  origSubject: string; // 再生成・リセット用の元値
  origText: string;
  lastSentAt: string | null;
  loading: boolean;
  error: string | null;
  sentTo: string | null;
}

export interface SendController {
  get: (key: string) => MailState | undefined;
  selected: Set<string>;
  bulkSending: boolean;
  bulkMsg: { tone: "ok" | "err"; text: string } | null;
  loadOne: (pair: SendPair, regenerate?: boolean) => void;
  loadMany: (pairs: SendPair[]) => Promise<void>;
  update: (key: string, patch: Partial<Pick<MailState, "subject" | "text">>) => void;
  reset: (key: string) => void;
  sendOne: (pair: SendPair) => Promise<void>;
  toggleSelect: (key: string) => void;
  selectMany: (keys: string[], on: boolean) => void;
  clearSelection: () => void;
  sendSelected: (pairs: SendPair[]) => Promise<void>;
}

const EMPTY_MAIL: MailState = {
  to: "",
  subject: "",
  text: "",
  origSubject: "",
  origText: "",
  lastSentAt: null,
  loading: false,
  error: null,
  sentTo: null,
};

export function useSendController(): SendController {
  const [mails, setMails] = useState<Map<string, MailState>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const patchMail = (key: string, patch: Partial<MailState>) =>
    setMails((cur) => {
      const next = new Map(cur);
      const prev = next.get(key) ?? EMPTY_MAIL;
      next.set(key, { ...prev, ...patch });
      return next;
    });

  async function loadOne(pair: SendPair, regenerate = false) {
    const key = pairKey(pair);
    patchMail(key, { loading: true, error: null });
    try {
      const res = await fetch("/api/send-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pair, preview: true, regenerate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "プレビューの取得に失敗しました");
      patchMail(key, {
        to: data.to,
        subject: data.subject,
        text: data.text,
        origSubject: data.subject,
        origText: data.text,
        lastSentAt: data.lastSentAt ?? null,
        loading: false,
        error: null,
      });
    } catch (e) {
      patchMail(key, { loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function loadMany(pairs: SendPair[]) {
    const targets = pairs.filter((p) => {
      const m = mails.get(pairKey(p));
      return !m || (!m.to && !m.loading);
    });
    if (targets.length === 0) return;
    for (const p of targets) patchMail(pairKey(p), { loading: true, error: null });
    try {
      const res = await fetch("/api/send-project/preview-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: targets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "一括読込に失敗しました");
      for (const it of data.items as Array<{
        talentId: string;
        projectId: string;
        ok: boolean;
        to?: string;
        subject?: string;
        text?: string;
        lastSentAt?: string | null;
        error?: string;
      }>) {
        const key = `${it.talentId}:${it.projectId}`;
        if (it.ok) {
          patchMail(key, {
            to: it.to ?? "",
            subject: it.subject ?? "",
            text: it.text ?? "",
            origSubject: it.subject ?? "",
            origText: it.text ?? "",
            lastSentAt: it.lastSentAt ?? null,
            loading: false,
            error: null,
          });
        } else {
          patchMail(key, { loading: false, error: it.error ?? "読込に失敗しました" });
        }
      }
    } catch (e) {
      for (const p of targets)
        patchMail(pairKey(p), { loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  function update(key: string, patch: Partial<Pick<MailState, "subject" | "text">>) {
    patchMail(key, patch);
  }
  function reset(key: string) {
    setMails((cur) => {
      const next = new Map(cur);
      const prev = next.get(key);
      if (prev) next.set(key, { ...prev, subject: prev.origSubject, text: prev.origText });
      return next;
    });
  }

  async function sendOne(pair: SendPair) {
    const key = pairKey(pair);
    const m = mails.get(key);
    if (!m || m.lastSentAt || m.sentTo) return;
    if (!window.confirm(`${m.to} 宛に案件案内メールを送信します。よろしいですか？`)) return;
    patchMail(key, { loading: true, error: null });
    try {
      const res = await fetch("/api/send-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pair, subject: m.subject, text: m.text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "送信に失敗しました");
      patchMail(key, { loading: false, sentTo: m.to });
      setSelected((cur) => {
        const next = new Set(cur);
        next.delete(key);
        return next;
      });
    } catch (e) {
      patchMail(key, { loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  function toggleSelect(key: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function selectMany(keys: string[], on: boolean) {
    setSelected((cur) => {
      const next = new Set(cur);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function sendSelected(allPairs: SendPair[]) {
    if (bulkSending || selected.size === 0) return;
    const pairs = allPairs.filter((p) => selected.has(pairKey(p)));
    if (pairs.length === 0) return;
    if (!window.confirm(`選択した ${pairs.length} 件の案件案内メールを送信します。よろしいですか？`)) return;
    setBulkSending(true);
    setBulkMsg(null);
    const payloadPairs = pairs.map((p) => {
      const m = mails.get(pairKey(p));
      return m ? { ...p, subject: m.subject, text: m.text } : p;
    });
    try {
      const res = await fetch("/api/send-project/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: payloadPairs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "一斉送信に失敗しました");
      for (const r of (data.results ?? []) as Array<{
        talentId: string;
        projectId: string;
        status: string;
        to?: string;
      }>) {
        if (r.status === "sent") patchMail(`${r.talentId}:${r.projectId}`, { sentTo: r.to ?? "" });
      }
      const parts = [`送信 ${data.sent}件`];
      if (data.skipped) parts.push(`スキップ ${data.skipped}件`);
      if (data.failed) parts.push(`失敗 ${data.failed}件`);
      setBulkMsg({ tone: data.failed ? "err" : "ok", text: parts.join(" / ") });
      clearSelection();
    } catch (e) {
      setBulkMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBulkSending(false);
    }
  }

  return {
    get: (key) => mails.get(key),
    selected,
    bulkSending,
    bulkMsg,
    loadOne,
    loadMany,
    update,
    reset,
    sendOne,
    toggleSelect,
    selectMany,
    clearSelection,
    sendSelected,
  };
}

/** 編集可能なメール送信パネル。controller で状態を共有。autoLoad=false で自動読込しない。 */
export function SendPanel({
  pair,
  controller,
  autoLoad = true,
}: {
  pair: SendPair;
  controller: SendController;
  autoLoad?: boolean;
}) {
  const key = pairKey(pair);
  const m = controller.get(key);
  const autoLoaded = useRef(false);

  useEffect(() => {
    if (!autoLoad || autoLoaded.current) return;
    autoLoaded.current = true;
    if (!m || (!m.to && !m.loading)) controller.loadOne(pair);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (m?.sentTo) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        ✅ {m.sentTo} 宛に送信しました。
      </div>
    );
  }

  const dirty = !!m && (m.subject !== m.origSubject || m.text !== m.origText);
  const loading = m?.loading ?? false;

  return (
    <div className="space-y-3">
      {m?.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {m.error}
        </div>
      )}
      {!m || (!m.to && loading) ? (
        <p className="py-6 text-center text-sm text-slate-500">メール内容を読み込み中…</p>
      ) : !m.to ? (
        <div className="py-6 text-center">
          <button
            onClick={() => controller.loadOne(pair)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            メール内容を表示
          </button>
        </div>
      ) : (
        <>
          {m.lastSentAt && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              ⚠️ {fmtDate(m.lastSentAt)} に送信済みです。再送信はできません。
            </div>
          )}
          <div className="flex gap-2 rounded-lg bg-slate-50 p-3 text-xs">
            <span className="w-10 shrink-0 text-slate-400">To:</span>
            <span className="break-all text-slate-700">{m.to || "-"}</span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">件名</label>
            <input
              value={m.subject}
              onChange={(e) => controller.update(key, { subject: e.target.value })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500">本文</label>
              {dirty && <span className="text-xs text-amber-600">編集済み</span>}
            </div>
            <textarea
              value={m.text}
              onChange={(e) => controller.update(key, { text: e.target.value })}
              rows={12}
              className="w-full resize-y rounded-lg border border-border px-3 py-2 font-mono text-[13px] leading-relaxed text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && (
              <button
                onClick={() => controller.reset(key)}
                disabled={loading}
                className="rounded-lg border border-border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                編集を戻す
              </button>
            )}
            <button
              onClick={() => controller.loadOne(pair, true)}
              disabled={loading}
              className="rounded-lg border border-border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="AIで本文を作り直します（編集内容は破棄）"
            >
              {loading ? "処理中…" : "AIで再生成"}
            </button>
            {!m.lastSentAt && (
              <button
                onClick={() => controller.sendOne(pair)}
                disabled={loading}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "送信中…" : "このメールを送信"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
