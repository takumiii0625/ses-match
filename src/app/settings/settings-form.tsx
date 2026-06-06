"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Org {
  id: string;
  name: string;
  slug: string;
  aiProvider: string;
  proposalSignature: string | null;
  createdAt: string;
}

const AI_PROVIDER_OPTIONS = [
  { value: "mock", label: "モック（APIキー不要）" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT)" },
];

const AI_PROVIDER_BADGE: Record<string, { label: string; tone: "slate" | "indigo" | "green" }> = {
  mock: { label: "モック", tone: "slate" },
  anthropic: { label: "Anthropic", tone: "indigo" },
  openai: { label: "OpenAI", tone: "green" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function SettingsForm({ org }: { org: Org }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState(org.name);
  const [aiProvider, setAiProvider] = useState(org.aiProvider);
  const [proposalSignature, setProposalSignature] = useState(org.proposalSignature ?? "");

  const providerBadge = AI_PROVIDER_BADGE[aiProvider] ?? AI_PROVIDER_BADGE["mock"];

  async function handleSave() {
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, aiProvider, proposalSignature }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "エラー: " + res.status);
      }

      setSuccessMsg("設定を保存しました。");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 組織情報 */}
      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-700 mb-4">組織情報</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="org-name">組織名</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="組織名を入力"
            />
          </div>
          <div>
            <Label>スラッグ（変更不可）</Label>
            <Input value={org.slug} readOnly className="bg-slate-50 text-slate-400 cursor-not-allowed" />
          </div>
          <div>
            <Label>作成日</Label>
            <p className="h-10 flex items-center text-sm text-slate-700">
              {formatDate(org.createdAt)}
            </p>
          </div>
        </div>
      </Card>

      {/* AI連携 */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-semibold text-slate-700">AI連携</h2>
          <Badge tone={providerBadge.tone}>{providerBadge.label}</Badge>
        </div>

        <div className="max-w-xs mb-4">
          <Label htmlFor="ai-provider">AIプロバイダー</Label>
          <Select
            id="ai-provider"
            options={AI_PROVIDER_OPTIONS}
            value={aiProvider}
            onChange={(e) => setAiProvider(e.target.value)}
          />
        </div>

        <div className="rounded-lg bg-slate-50 border border-border p-4 text-xs text-slate-500 space-y-1">
          <p className="font-medium text-slate-600 text-xs mb-2">APIキーの設定について</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>
              <span className="font-medium">モック</span>
              {" — "}APIキー不要。開発・動作確認に使用。
            </li>
            <li>
              <span className="font-medium">Anthropic (Claude)</span>
              {" — "}<code className="bg-slate-100 px-1 rounded">ANTHROPIC_API_KEY</code> を <code className="bg-slate-100 px-1 rounded">.env</code> に設定してください。
            </li>
            <li>
              <span className="font-medium">OpenAI (GPT)</span>
              {" — "}<code className="bg-slate-100 px-1 rounded">OPENAI_API_KEY</code> を <code className="bg-slate-100 px-1 rounded">.env</code> に設定してください。
            </li>
          </ul>
        </div>
      </Card>

      {/* 提案メール署名 */}
      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-700 mb-1">提案メール署名</h2>
        <p className="text-xs text-slate-400 mb-4">
          提案メール生成時に本文末尾へ自動で追記されます。
        </p>
        <Label htmlFor="proposal-signature">署名</Label>
        <Textarea
          id="proposal-signature"
          rows={6}
          value={proposalSignature}
          onChange={(e) => setProposalSignature(e.target.value)}
          placeholder="株式会社〇〇&#10;担当: 山田 太郎&#10;TEL: 03-XXXX-XXXX&#10;Email: taro@example.com"
          className="resize-y"
        />
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? "保存中…" : "保存"}
        </Button>
        {successMsg && (
          <span className="text-sm text-emerald-600 font-medium">{successMsg}</span>
        )}
        {errorMsg && (
          <span className="text-sm text-red-600 font-medium">{errorMsg}</span>
        )}
      </div>
    </div>
  );
}
