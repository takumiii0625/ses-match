"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchJson } from "@/lib/http";

interface Preview {
  talentId: string;
  projectId: string;
  score: number;
  talentName: string;
  projectTitle: string;
  subject: string;
  text: string;
  realTo: string;
  testAddr: string;
}

export function TestMailView() {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [mail, setMail] = useState<Preview | null>(null);

  async function loadRandom() {
    setLoading(true);
    setError(null);
    setSent(null);
    try {
      const data = await fetchJson<Preview>("/api/test-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "random" }),
      });
      setMail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
      setMail(null);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!mail || sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await fetchJson<{ to: string }>("/api/test-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", talentId: mail.talentId, projectId: mail.projectId }),
      });
      setSent(data.to);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button onClick={loadRandom} disabled={loading}>
          {loading ? "取得中…" : mail ? "別のマッチを取得" : "ランダムなマッチを取得"}
        </Button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {sent && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          ✅ {sent} にテスト送信しました。
        </div>
      )}

      {mail && (
        <Card className="flex flex-col overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-slate-50 px-4 py-3 text-sm">
            <Badge tone="green">{Math.round(mail.score)}点</Badge>
            <span className="text-slate-700">人材: {mail.talentName}</span>
            <span className="text-slate-700">案件: {mail.projectTitle}</span>
          </div>
          <div className="space-y-1 border-b border-border px-4 py-3 text-sm">
            <div>
              <span className="text-slate-400">送信先（テスト）: </span>
              <span className="font-medium text-slate-800">{mail.testAddr}</span>
            </div>
            <div className="text-xs text-muted">本来の宛先（送りません）: {mail.realTo}</div>
            <div>
              <span className="text-slate-400">件名: </span>
              {mail.subject}
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 text-sm leading-relaxed text-slate-700">
            {mail.text}
          </div>
          <div className="border-t border-border p-4">
            <Button onClick={send} disabled={sending} className="w-full">
              {sending ? "送信中…" : `${mail.testAddr} にテスト送信`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
