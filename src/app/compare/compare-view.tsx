"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Send } from "lucide-react";
import { dedupeLatest, talentDedupeKey, projectDedupeKey } from "@/lib/dedupe";
import { channelStatus } from "@/lib/channel";
import { Badge, statusTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatRate, daysAgo } from "@/lib/utils";
import {
  TALENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  GENDER_LABELS,
  REMOTE_LABELS,
} from "@/lib/enums";

export type CompareMode = "talent" | "project";

export interface TalentVM {
  id: string;
  name: string;
  status: string;
  talentType: string | null;
  age: number | null;
  gender: string | null;
  affiliation: string | null;
  desiredRateMin: number | null;
  desiredRateMax: number | null;
  mainSkills: string[];
  skills: string[];
  remotePreference: string | null;
  availabilityText: string | null;
  nearestStation: string | null;
  note: string | null;
  summaryText: string | null; // スキルシート（PDF）から抽出したテキスト
  emailSubject: string | null;
  emailBody: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  sourceEmail: string | null;
  receivedDate: string | null;
}

export interface ProjectVM {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
  requiredSkills: string[];
  rateMin: number | null;
  rateMax: number | null;
  remotePreference: string | null;
  location: string | null;
  startText: string | null;
  description: string | null;
  channelText: string | null;
  supportFee: boolean;
  emailSubject: string | null;
  emailBody: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  sourceEmail: string | null;
  receivedDate: string | null;
}

/** 右ペインの案件カード（人材起点）。クリックで詳細を出すため本文等も持つ。 */
export interface ProjectCardVM extends ProjectVM {
  matchId: string;
  score: number;
  reasons: string[];
  proposable: boolean;
  channelNote: string | null;
  locationOk: boolean | null;
  sentInfoAt: string | null; // 案件案内メール送信済み日時（未送信なら null）
}

/** 右ペインの人材カード（案件起点）。 */
export interface TalentCardVM extends TalentVM {
  matchId: string;
  score: number;
  reasons: string[];
  proposable: boolean;
  channelNote: string | null;
  locationOk: boolean | null;
  sentInfoAt: string | null; // 案件案内メール送信済み日時（未送信なら null）
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function scoreTone(score: number): "green" | "amber" | "slate" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "slate";
}

function splitReasons(reasons: string[]) {
  const strengths: string[] = [];
  const concerns: string[] = [];
  for (const r of reasons) {
    if (r.startsWith("懸念:")) concerns.push(r.replace(/^懸念:\s*/, ""));
    else strengths.push(r);
  }
  return { strengths, concerns };
}

function GF({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{children ?? "-"}</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-slate-400">{label}</span>
      <span className="break-all text-slate-700">{value || "-"}</span>
    </div>
  );
}

function SkillTags({ main, all }: { main: string[]; all: string[] }) {
  if (main.length === 0 && all.length === 0)
    return <span className="text-sm text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {main.map((s) => (
        <Badge key={s} tone="blue">
          {s}
        </Badge>
      ))}
      {all
        .filter((s) => !main.includes(s))
        .map((s) => (
          <Badge key={s} tone="slate">
            {s}
          </Badge>
        ))}
    </div>
  );
}

// ---------- 人材のサマリ・詳細ノード ----------
function talentSummary(t: TalentVM) {
  return (
    <>
      <GF label="名前">{t.name}</GF>
      <GF label="年齢">{t.age ?? "-"}</GF>
      <GF label="性別">{t.gender ? GENDER_LABELS[t.gender] : "-"}</GF>
      <GF label="所属">{t.affiliation ?? "-"}</GF>
      <GF label="希望単価">{formatRate(t.desiredRateMin, t.desiredRateMax)}</GF>
      <GF label="リモート">
        {t.remotePreference ? REMOTE_LABELS[t.remotePreference] : "-"}
      </GF>
      <GF label="稼働開始">{t.availabilityText ?? "-"}</GF>
      <GF label="ステータス">
        <Badge tone={statusTone(t.status)}>
          {TALENT_STATUS_LABELS[t.status] ?? t.status}
        </Badge>
      </GF>
      <GF label="最寄駅">{t.nearestStation ?? "-"}</GF>
      <div className="col-span-2 sm:col-span-3">
        <div className="mb-1 text-xs text-slate-400">スキル</div>
        <SkillTags main={t.mainSkills} all={t.skills} />
      </div>
    </>
  );
}

function projectSummary(p: ProjectVM) {
  return (
    <>
      <div className="col-span-2 sm:col-span-3">
        <GF label="案件名">{p.title}</GF>
      </div>
      <GF label="クライアント/商流">{p.clientName ?? "-"}</GF>
      <GF label="単価">{formatRate(p.rateMin, p.rateMax)}</GF>
      <GF label="リモート">
        {p.remotePreference ? REMOTE_LABELS[p.remotePreference] : "-"}
      </GF>
      <GF label="募集状況">
        <Badge tone={statusTone(p.status)}>
          {PROJECT_STATUS_LABELS[p.status] ?? p.status}
        </Badge>
      </GF>
      <GF label="開始時期">{p.startText ?? "-"}</GF>
      <GF label="勤務地">{p.location ?? "-"}</GF>
      <GF label="商流">
        {p.channelText ?? "-"}
        {p.supportFee && <span className="ml-1 text-emerald-600">（支援費あり）</span>}
      </GF>
      <div className="col-span-2 sm:col-span-3">
        <div className="mb-1 text-xs text-slate-400">必須スキル</div>
        {p.requiredSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {p.requiredSkills.map((s) => (
              <Badge key={s} tone="indigo">
                {s}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-slate-400">-</span>
        )}
      </div>
    </>
  );
}

interface EmailInfo {
  from: string | null;
  to: string | null;
  received: string | null;
  subject: string | null;
  body: string | null;
  fallback: string | null;
}

// ---------- メール送信の状態管理（一覧で編集・選択・一斉送信を統括） ----------
// メール本文はマッチ時に整形・キャッシュ済み（Project.formattedBody）なので即表示できる。
// 各メールは件名・本文を画面で編集でき、編集内容のまま単体/一斉送信できる。
type SendPair = { talentId: string; projectId: string };

function pairKey(p: SendPair): string {
  return `${p.talentId}:${p.projectId}`;
}

interface MailState {
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

interface SendController {
  get: (key: string) => MailState | undefined;
  selected: Set<string>;
  bulkSending: boolean;
  loadOne: (pair: SendPair, regenerate?: boolean) => void;
  update: (key: string, patch: Partial<Pick<MailState, "subject" | "text">>) => void;
  reset: (key: string) => void;
  sendOne: (pair: SendPair) => Promise<void>;
  toggleSelect: (key: string) => void;
}

function useSendController(): SendController & {
  loadMany: (pairs: SendPair[]) => Promise<void>;
  selectMany: (keys: string[], on: boolean) => void;
  clearSelection: () => void;
  sendSelected: (pairs: SendPair[]) => Promise<void>;
  bulkMsg: { tone: "ok" | "err"; text: string } | null;
} {
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
    // 編集済み内容があれば一緒に送る。
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
      // 結果を各メールに反映（sent→送信済みに）。
      for (const r of (data.results ?? []) as Array<{
        talentId: string;
        projectId: string;
        status: string;
        to?: string;
      }>) {
        if (r.status === "sent") {
          patchMail(`${r.talentId}:${r.projectId}`, { sentTo: r.to ?? "" });
        }
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

/** 編集可能なメール送信パネル（一覧の各アイテム内に表示）。controller で状態を共有。 */
function SendPanel({ pair, controller }: { pair: SendPair; controller: SendController }) {
  const key = pairKey(pair);
  const m = controller.get(key);
  const autoLoaded = useRef(false);

  // タブを開いた時に一度だけ自動で内容を読み込む（編集や一括読込で既にあれば再取得しない）。
  useEffect(() => {
    if (autoLoaded.current) return;
    autoLoaded.current = true;
    if (!m || (!m.to && !m.loading)) controller.loadOne(pair);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <MetaRow label="To:" value={m.to} />
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

// ---------- 詳細本体（サマリ + タブ）。左ペインCardにも右ペインの展開部にも使う ----------
function DetailTabsBody({
  summary,
  email,
  detail,
  match,
  sendPair,
  sendController,
  skillSheet,
  scrollAll = false,
}: {
  summary: React.ReactNode;
  email: EmailInfo;
  detail: React.ReactNode;
  match?: { score: number; reasons: string[] }; // 指定時「マッチング項目」タブを表示
  sendPair?: SendPair; // 指定時「メール送信」タブを表示（案件→人材の案内メール）
  sendController?: SendController; // メール送信の共有状態（編集・一斉送信用）
  // 指定時「スキルシート」タブを表示（人材のみ）。null/空文字は「スキルシートなし」表示。
  skillSheet?: string | null;
  // true: サマリ+タブ+本文を1つのスクロール領域にまとめる（左ペイン用＝本文を広く読める）。
  // false: 本文だけが flex-1 でスクロール（アコーディオン展開部はそのまま下に伸びる）。
  scrollAll?: boolean;
}) {
  const hasEmail = !!(email.body || email.from || email.subject);
  const canSend = !!(sendPair && sendController);
  // メール送信できる場合は最初から「メール送信」タブを開く（編集→送信の動線を最短に）。
  const [tab, setTab] = useState<"mail" | "detail" | "match" | "send" | "sheet">(
    canSend ? "send" : hasEmail ? "mail" : "detail",
  );

  const tabBtn = (key: "mail" | "detail" | "match" | "send" | "sheet", label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
        tab === key
          ? "border-b-2 border-primary text-primary"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );

  const body = (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border px-5 py-4 sm:grid-cols-3">
        {summary}
      </div>

      <div className="flex gap-1 border-b border-border px-3 pt-2">
        {tabBtn("mail", "メール本文")}
        {tabBtn("detail", "詳細情報")}
        {match && tabBtn("match", "マッチング項目")}
        {canSend && tabBtn("send", "メール送信")}
        {skillSheet !== undefined && tabBtn("sheet", "スキルシート")}
      </div>

      <div className={scrollAll ? "px-5 py-4" : "flex-1 overflow-y-auto px-5 py-4"}>
        {tab === "mail" ? (
          hasEmail || email.fallback ? (
            <div>
              <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-3">
                <MetaRow label="From:" value={email.from} />
                <MetaRow label="To:" value={email.to} />
                <MetaRow label="Received:" value={fmtDate(email.received)} />
              </div>
              {email.subject && (
                <div className="mb-2 break-words text-sm font-medium text-slate-800">
                  {email.subject}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                {email.body || email.fallback || "（本文なし）"}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              メール本文はありません（手動登録など）
            </p>
          )
        ) : tab === "detail" ? (
          detail
        ) : tab === "send" ? (
          sendPair && sendController ? (
            <SendPanel pair={sendPair} controller={sendController} />
          ) : null
        ) : tab === "sheet" ? (
          skillSheet?.trim() ? (
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
              {skillSheet}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">スキルシートなし</p>
          )
        ) : (
          match && <MatchTab score={match.score} reasons={match.reasons} />
        )}
      </div>
    </>
  );

  // 左ペイン: サマリも本文も含めて1つのスクロール領域にする（本文を広く読める）。
  return scrollAll ? <div className="flex-1 overflow-y-auto">{body}</div> : body;
}

// 左ペイン: Card + ヘッダ + 詳細本体
function DetailView({
  heading,
  summary,
  email,
  detail,
  editHref,
  match,
  skillSheet,
}: {
  heading: string;
  summary: React.ReactNode;
  email: EmailInfo;
  detail: React.ReactNode;
  editHref: string;
  match?: { score: number; reasons: string[] };
  skillSheet?: string | null;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="truncate text-base font-bold text-slate-800">{heading}</span>
        <Link href={editHref} className="shrink-0 text-xs text-slate-500 hover:text-primary">
          詳細・編集 →
        </Link>
      </div>
      <DetailTabsBody
        summary={summary}
        email={email}
        detail={detail}
        match={match}
        skillSheet={skillSheet}
        scrollAll
      />
    </Card>
  );
}

function MatchTab({ score, reasons }: { score: number; reasons: string[] }) {
  const { strengths, concerns } = splitReasons(reasons);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">マッチ度</span>
        <Badge tone={scoreTone(score)} className="text-sm tabular-nums">
          {Math.round(score)}点
        </Badge>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-emerald-700">合致点</div>
        {strengths.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
            {strengths.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">-</p>
        )}
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-amber-700">懸念点</div>
        {concerns.length > 0 ? (
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
            {concerns.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">-</p>
        )}
      </div>
    </div>
  );
}

function talentEmail(t: TalentVM): EmailInfo {
  return {
    from: t.emailFrom ?? t.sourceEmail,
    to: t.emailTo,
    received: t.receivedDate,
    subject: t.emailSubject,
    body: t.emailBody,
    fallback: t.note,
  };
}
function projectEmail(p: ProjectVM): EmailInfo {
  return {
    from: p.emailFrom ?? p.sourceEmail,
    to: p.emailTo,
    received: p.receivedDate,
    subject: p.emailSubject,
    body: p.emailBody,
    fallback: p.description,
  };
}
function noteDetail(text: string | null, label: string) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-400">{label}</div>
      <p className="whitespace-pre-wrap text-sm text-slate-700">{text || "-"}</p>
    </div>
  );
}

// ---------- 右ペインのアコーディオン項目（クリックで下に詳細を展開） ----------
function AccordionItem({
  top,
  open,
  onToggle,
  header,
  detail,
  sendController,
  selectable,
  selected,
  sentInfoAt,
  onToggleSelect,
}: {
  top: boolean;
  open: boolean;
  onToggle: () => void;
  header: React.ReactNode;
  detail: { summary: React.ReactNode; email: EmailInfo; detailNode: React.ReactNode; match: { score: number; reasons: string[] }; editHref: string; sendPair?: SendPair; skillSheet?: string | null };
  sendController?: SendController;
  selectable?: boolean; // 一斉送信のチェック対象に出来るか（送信済みは不可）
  selected?: boolean;
  sentInfoAt?: string | null;
  onToggleSelect?: () => void;
}) {
  // 送信済み（サーバ既知 or この画面で送信済み）か。
  const sentInPanel = detail.sendPair && sendController?.get(pairKey(detail.sendPair))?.sentTo;
  const isSent = !!sentInfoAt || !!sentInPanel;
  return (
    <div
      className={`overflow-hidden rounded-xl border transition-colors ${
        open
          ? "border-primary/40 ring-1 ring-primary/20"
          : selected
            ? "border-primary/50 bg-primary/5"
            : top
              ? "border-amber-300"
              : "border-border"
      } ${top && !open && !selected ? "bg-amber-50/60" : selected ? "" : "bg-white"}`}
    >
      <div className="flex items-start gap-2 p-4">
        {/* 一斉送信チェック（送信済みは✓表示） */}
        {detail.sendPair && (
          <div className="flex w-5 shrink-0 justify-center pt-1" onClick={(e) => e.stopPropagation()}>
            {isSent ? (
              <span className="text-emerald-500" title="送信済み">✓</span>
            ) : (
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={!!selected}
                disabled={!selectable}
                onChange={onToggleSelect}
                title="一斉送信に選択"
              />
            )}
          </div>
        )}
        <button
          onClick={onToggle}
          className="-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-lg p-1 text-left transition-colors hover:bg-slate-50"
        >
          <div className="min-w-0 flex-1">{header}</div>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
      {open && (
        <div className="border-t border-border">
          <DetailTabsBody
            summary={detail.summary}
            email={detail.email}
            detail={detail.detailNode}
            match={detail.match}
            sendPair={detail.sendPair}
            sendController={sendController}
            skillSheet={detail.skillSheet}
          />
          <div className="border-t border-border px-5 py-2 text-right">
            <Link href={detail.editHref} className="text-xs text-slate-500 hover:text-primary">
              詳細・編集ページを開く →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function projectHeader(p: ProjectCardVM, top: boolean, dupes = 1) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {top && <Badge tone="amber">最有力</Badge>}
            <span className="truncate font-semibold text-slate-800">{p.title}</span>
            {dupes > 1 && <Badge tone="slate">同一{dupes}件</Badge>}
          </div>
          {p.clientName && <div className="mt-0.5 text-xs text-slate-500">{p.clientName}</div>}
          <div className="mt-0.5 text-[11px] text-slate-400">配信: {daysAgo(p.receivedDate)}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={scoreTone(p.score)} className="tabular-nums">
            {Math.round(p.score)}点
          </Badge>
          {(() => {
            const cs = channelStatus(p.proposable, p.channelNote);
            return cs ? <Badge tone={cs.tone}>{cs.label}</Badge> : null;
          })()}
          {p.locationOk === true && <Badge tone="green">勤務地・勤務形態OK</Badge>}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
        <div>
          <span className="text-slate-400">募集状況: </span>
          <Badge tone={statusTone(p.status)}>{PROJECT_STATUS_LABELS[p.status] ?? p.status}</Badge>
        </div>
        <div>
          <span className="text-slate-400">開始: </span>
          {p.startText ?? "-"}
        </div>
        <div>
          <span className="text-slate-400">単価: </span>
          {formatRate(p.rateMin, p.rateMax)}
        </div>
        <div>
          <span className="text-slate-400">リモート: </span>
          {p.remotePreference ? REMOTE_LABELS[p.remotePreference] : "-"}
        </div>
      </div>
      {p.requiredSkills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.requiredSkills.map((s) => (
            <Badge key={s} tone="indigo">
              {s}
            </Badge>
          ))}
        </div>
      )}
      {!p.proposable && p.channelNote && (
        <div className="mt-2">
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs text-red-700">
            提案不可の理由: {p.channelNote}
          </span>
        </div>
      )}
    </>
  );
}

function talentHeader(t: TalentCardVM, top: boolean, dupes = 1) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {top && <Badge tone="amber">最有力</Badge>}
            <span className="truncate font-semibold text-slate-800">{t.name}</span>
            {dupes > 1 && <Badge tone="slate">同一{dupes}件</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
            <span>所属: {t.affiliation ?? "-"}</span>
            <span>配信: {daysAgo(t.receivedDate)}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={scoreTone(t.score)} className="tabular-nums">
            {Math.round(t.score)}点
          </Badge>
          {(() => {
            const cs = channelStatus(t.proposable, t.channelNote);
            return cs ? <Badge tone={cs.tone}>{cs.label}</Badge> : null;
          })()}
          {t.locationOk === true && <Badge tone="green">勤務地・勤務形態OK</Badge>}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
        <div>
          <span className="text-slate-400">年齢: </span>
          {t.age ?? "-"}
        </div>
        <div>
          <span className="text-slate-400">希望単価: </span>
          {formatRate(t.desiredRateMin, t.desiredRateMax)}
        </div>
        <div>
          <span className="text-slate-400">稼働開始: </span>
          {t.availabilityText ?? "-"}
        </div>
        <div>
          <span className="text-slate-400">リモート: </span>
          {t.remotePreference ? REMOTE_LABELS[t.remotePreference] : "-"}
        </div>
      </div>
      {(t.mainSkills.length > 0 || t.skills.length > 0) && (
        <div className="mt-2">
          <SkillTags main={t.mainSkills} all={t.skills} />
        </div>
      )}
      {!t.proposable && t.channelNote && (
        <div className="mt-2">
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs text-red-700">
            提案不可の理由: {t.channelNote}
          </span>
        </div>
      )}
    </>
  );
}

// ---------- 右ペイン（一覧。各項目はクリックで下に展開） ----------
function RightPane({
  mode,
  selfId,
  projects,
  talents,
}: {
  mode: CompareMode;
  selfId: string; // 左ペインで選択中の人材/案件のID（送信ペアの相手側）
  projects: ProjectCardVM[];
  talents: TalentCardVM[];
}) {
  // 初期は全て閉じる。複数同時に開ける（クリックで個別に開閉）。
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 同一案件/人材（名前・タイトル）をまとめ、最新配信を代表に。スコア順で表示。
  const dedupProjects = useMemo(
    () =>
      dedupeLatest(
        projects,
        (p) => projectDedupeKey(p.title, p.clientName),
        (p) => p.receivedDate,
      ).sort((a, b) => b.item.score - a.item.score),
    [projects],
  );
  const dedupTalents = useMemo(
    () =>
      dedupeLatest(
        talents,
        (t) => talentDedupeKey(t.name, t.mainSkills),
        (t) => t.receivedDate,
      ).sort((a, b) => b.item.score - a.item.score),
    [talents],
  );

  const controller = useSendController();

  // mode 非依存の統一行配列（ツールバー・一斉送信を共通で扱う）。
  const rows = useMemo(() => {
    if (mode === "talent") {
      return dedupProjects.map(({ item: p, dupes }, i) => {
        const pair: SendPair = { talentId: selfId, projectId: p.id };
        return {
          key: pairKey(pair),
          id: p.id,
          matchId: p.matchId,
          top: i === 0,
          dupes,
          pair,
          sentInfoAt: p.sentInfoAt,
          header: projectHeader(p, i === 0, dupes),
          detail: {
            summary: projectSummary(p),
            email: projectEmail(p),
            detailNode: noteDetail(p.description, "概要"),
            match: { score: p.score, reasons: p.reasons },
            editHref: `/projects/${p.id}`,
            sendPair: pair,
          },
        };
      });
    }
    return dedupTalents.map(({ item: t, dupes }, i) => {
      const pair: SendPair = { talentId: t.id, projectId: selfId };
      return {
        key: pairKey(pair),
        id: t.id,
        matchId: t.matchId,
        top: i === 0,
        dupes,
        pair,
        sentInfoAt: t.sentInfoAt,
        header: talentHeader(t, i === 0, dupes),
        detail: {
          summary: talentSummary(t),
          email: talentEmail(t),
          detailNode: noteDetail(t.note, "備考情報"),
          match: { score: t.score, reasons: t.reasons },
          editHref: `/talent/${t.id}`,
          sendPair: pair,
          skillSheet: t.summaryText,
        },
      };
    });
  }, [mode, dedupProjects, dedupTalents, selfId]);

  const count = rows.length;
  const title = mode === "talent" ? "対象案件リスト" : "対象人材リスト";

  // 送信済みでない＝一斉送信に選べる行。
  const isRowSent = (r: (typeof rows)[number]) =>
    !!r.sentInfoAt || !!controller.get(r.key)?.sentTo;
  const eligible = rows.filter((r) => !isRowSent(r));
  const eligibleKeys = eligible.map((r) => r.key);
  const allSelected =
    eligibleKeys.length > 0 && eligibleKeys.every((k) => controller.selected.has(k));
  const allPairs = rows.map((r) => r.pair);

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden p-0">
      <div className="border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base font-bold text-slate-800">{title}</span>
          <span className="text-sm text-muted">{count}件</span>
          {eligible.length > 0 && (
            <span className="text-xs text-slate-400">／ 未送信 {eligible.length}件</span>
          )}
        </div>
        {/* メール一括ツールバー */}
        {eligible.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={allSelected}
                onChange={() => controller.selectMany(eligibleKeys, !allSelected)}
              />
              すべて選択
            </label>
            <button
              onClick={() => controller.loadMany(eligible.map((r) => r.pair))}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
              title="未送信メールの内容をまとめて読み込み、編集・確認できます"
            >
              メールを一括読込
            </button>
            {controller.selected.size > 0 && (
              <span className="text-xs font-medium text-primary">
                {controller.selected.size}件選択中
              </span>
            )}
          </div>
        )}
        {controller.bulkMsg && (
          <div
            className={`mt-2 rounded-lg px-3 py-1.5 text-xs ${
              controller.bulkMsg.tone === "err"
                ? "bg-red-50 text-red-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            一括送信の結果: {controller.bulkMsg.text}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {count === 0 ? (
          <div className="py-16 text-center text-sm text-muted">
            マッチした{mode === "talent" ? "案件" : "人材"}がありません。
            <Link href="/matching" className="ml-1 text-primary underline">
              マッチングを実行
            </Link>
            してください。
          </div>
        ) : (
          rows.map((r) => (
            <AccordionItem
              key={r.key}
              top={r.top}
              open={openIds.has(r.id)}
              onToggle={() => toggle(r.id)}
              header={r.header}
              detail={r.detail}
              sendController={controller}
              selectable={!isRowSent(r)}
              selected={controller.selected.has(r.key)}
              sentInfoAt={r.sentInfoAt}
              onToggleSelect={() => controller.toggleSelect(r.key)}
            />
          ))
        )}
      </div>

      {/* 一斉送信バー（選択中のみ表示） */}
      {controller.selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-white px-5 py-3">
          <button
            onClick={controller.clearSelection}
            disabled={controller.bulkSending}
            className="text-xs text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
          >
            選択解除
          </button>
          <button
            onClick={() => controller.sendSelected(allPairs)}
            disabled={controller.bulkSending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {controller.bulkSending
              ? "送信中…"
              : `選択した ${controller.selected.size} 件を送信`}
          </button>
        </div>
      )}
    </Card>
  );
}

function ModeToggle({ mode }: { mode: CompareMode }) {
  const pill = (m: CompareMode, label: string) => (
    <Link
      href={`/compare?mode=${m}`}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        mode === m ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">起点:</span>
      {pill("talent", "人材起点")}
      {pill("project", "案件起点")}
    </div>
  );
}

export function CompareView({
  mode,
  options,
  selectedId,
  talent,
  project,
  rightProjects,
  rightTalents,
}: {
  mode: CompareMode;
  options: { value: string; label: string }[];
  selectedId?: string;
  talent: TalentVM | null;
  project: ProjectVM | null;
  rightProjects: ProjectCardVM[];
  rightTalents: TalentCardVM[];
}) {
  const router = useRouter();
  const idParam = mode === "talent" ? "talentId" : "projectId";
  const leftSelected = mode === "talent" ? talent : project;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 起点トグル + セレクタ */}
      <div className="flex flex-wrap items-center gap-3">
        <ModeToggle mode={mode} />
        <div className="min-w-[260px]">
          <Select
            options={options}
            placeholder={mode === "talent" ? "人材を選択してください" : "案件を選択してください"}
            value={selectedId ?? ""}
            onChange={(e) =>
              router.push(
                e.target.value
                  ? `/compare?mode=${mode}&${idParam}=${e.target.value}`
                  : `/compare?mode=${mode}`,
              )
            }
          />
        </div>
      </div>

      {!leftSelected ? (
        <Card className="flex flex-1 items-center justify-center p-16 text-center text-sm text-muted">
          {mode === "talent"
            ? "人材を選択すると、左に人材詳細・右にマッチした案件が並びます。"
            : "案件を選択すると、左に案件詳細・右にマッチした人材が並びます。"}
        </Card>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 左 */}
          <div className="min-h-0 lg:overflow-hidden">
            {mode === "talent" && talent ? (
              <DetailView
                heading={talent.name}
                summary={talentSummary(talent)}
                email={talentEmail(talent)}
                detail={noteDetail(talent.note, "備考情報")}
                editHref={`/talent/${talent.id}`}
                skillSheet={talent.summaryText}
              />
            ) : project ? (
              <DetailView
                heading={project.title}
                summary={projectSummary(project)}
                email={projectEmail(project)}
                detail={noteDetail(project.description, "概要")}
                editHref={`/projects/${project.id}`}
              />
            ) : null}
          </div>

          {/* 右 */}
          <RightPane mode={mode} selfId={leftSelected.id} projects={rightProjects} talents={rightTalents} />
        </div>
      )}
    </div>
  );
}
