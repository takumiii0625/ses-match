"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/http";

export interface BlastTalent {
  id: string;
  name: string;
  distributionSubject: string | null;
  skills: string[];
  rate: string | null;
  availability: string | null;
}
export interface CampaignRow {
  id: string;
  subject: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

interface PreviewEmail {
  talentId: string;
  talentName: string;
  subject: string;
  text: string;
}
interface Preview {
  emails: PreviewEmail[];
  talentCount: number;
  recipientCount: number;
  totalEmails: number;
  sampleRecipients: { id: string; email: string; company: string }[];
}

const STATUS_BADGE: Record<string, { label: string; tone: "blue" | "green" | "amber" | "slate" | "red" }> = {
  DRAFT: { label: "下書き", tone: "slate" },
  QUEUED: { label: "送信待ち", tone: "blue" },
  SENDING: { label: "送信中", tone: "amber" },
  DONE: { label: "完了", tone: "green" },
  FAILED: { label: "失敗", tone: "red" },
  CANCELED: { label: "中止", tone: "slate" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

export function BlastView({
  talents,
  activeContactCount,
  campaigns,
}: {
  talents: BlastTalent[];
  activeContactCount: number;
  campaigns: CampaignRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return talents;
    return talents.filter(
      (t) => t.name.toLowerCase().includes(q) || t.skills.some((s) => s.toLowerCase().includes(q)),
    );
  }, [talents, search]);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
    setConfirmChecked(false);
  }

  async function loadPreview() {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<Preview>("/api/blast/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentIds: [...selected] }),
      });
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "プレビューに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!preview || !confirmChecked || sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await fetchJson<{ campaignCount: number; totalEmails: number }>("/api/blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentIds: [...selected], confirm: true }),
      });
      setDone(
        `送信キューに登録しました（人材${data.campaignCount}名・計${data.totalEmails}通）。数分以内に順次送信されます。`,
      );
      setPreview(null);
      setSelected(new Set());
      setConfirmChecked(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {done && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          ✅ {done}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 左: 人材選択 */}
        <Card className="flex flex-col overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3">
            <span className="text-sm font-bold text-slate-800">紹介する人材</span>
            <span className="ml-2 text-xs text-muted">{selected.size}名選択中</span>
          </div>
          <div className="border-b border-border p-3">
            <Input placeholder="氏名・スキルで絞り込み" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="max-h-[420px] flex-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">自社保有人材がありません。</p>
            ) : (
              filtered.map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg p-2.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-slate-800">{t.name}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {t.skills.map((s) => (
                        <Badge key={s} tone="indigo">{s}</Badge>
                      ))}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {t.rate && <>単価 {t.rate}　</>}
                      {t.availability && <>稼働 {t.availability}</>}
                    </span>
                    <span className="mt-0.5 block text-xs">
                      {t.distributionSubject ? (
                        <span className="text-slate-500">件名: {t.distributionSubject}</span>
                      ) : (
                        <span className="text-amber-600">配信件名 未設定（共通件名で送信）</span>
                      )}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="border-t border-border p-3">
            <Button onClick={loadPreview} disabled={selected.size === 0 || loading} className="w-full">
              {loading ? "生成中…" : "メール内容をプレビュー"}
            </Button>
          </div>
        </Card>

        {/* 右: プレビュー＋送信 */}
        <Card className="flex flex-col overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3">
            <span className="text-sm font-bold text-slate-800">送信プレビュー</span>
          </div>
          {!preview ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted">
              人材を選んで「メール内容をプレビュー」を押してください。
            </div>
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="border-b border-border bg-amber-50 px-4 py-3 text-sm text-amber-800">
                ⚠️ <span className="font-bold">計{preview.totalEmails}通</span>
                （人材{preview.talentCount}名 × 配信中{preview.recipientCount}社）を送信します。
                人材ごとに別件名・別メールで、外部の取引先に実際に届きます。
              </div>
              <div className="border-b border-border bg-slate-50 px-4 py-2 text-xs text-muted">
                宛先例: {preview.sampleRecipients.map((r) => r.company).join("、")}
                {preview.recipientCount > preview.sampleRecipients.length && " ほか"}
              </div>
              {/* 人材ごとのメール（件名＋本文） */}
              <div className="max-h-[360px] flex-1 overflow-y-auto">
                {preview.emails.map((m, i) => (
                  <div key={m.talentId} className="border-b border-border last:border-0">
                    <div className="bg-slate-50 px-4 py-2 text-sm">
                      <span className="text-xs text-muted">
                        {i + 1}/{preview.emails.length}・{m.talentName}
                      </span>
                      <div className="font-medium text-slate-800">件名: {m.subject}</div>
                    </div>
                    <div className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed text-slate-700">
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border p-4">
                <label className="mb-3 flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={(e) => setConfirmChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span>
                    内容・件名・総送信数（計{preview.totalEmails}通）を確認しました。送信します。
                  </span>
                </label>
                <Button onClick={send} disabled={!confirmChecked || sending} className="w-full">
                  {sending ? "登録中…" : `計${preview.totalEmails}通を一斉送信`}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 送信履歴（キャンペーン） */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3">
          <span className="text-sm font-bold text-slate-800">一斉送信の履歴</span>
        </div>
        {campaigns.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">まだ送信していません。</p>
        ) : (
          <div className="divide-y divide-border">
            {campaigns.map((c) => {
              const b = STATUS_BADGE[c.status] ?? STATUS_BADGE.DRAFT;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <Badge tone={b.tone}>{b.label}</Badge>
                  <span className="min-w-0 flex-1 break-words text-slate-700">{c.subject}</span>
                  <span className="tabular-nums text-xs text-muted">
                    送信 {c.sentCount}/{c.totalCount}
                    {c.failedCount > 0 && <span className="text-red-600">（失敗{c.failedCount}）</span>}
                  </span>
                  <span className="text-xs text-muted">{fmtDate(c.createdAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
