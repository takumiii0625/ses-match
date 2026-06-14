"use client";

import { useState } from "react";
import Link from "next/link";
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
  autoEmailEnabled: boolean;
  autoEmailDailyCap: number;
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
  const [autoEmailEnabled, setAutoEmailEnabled] = useState(org.autoEmailEnabled);
  const [autoEmailDailyCap, setAutoEmailDailyCap] = useState(String(org.autoEmailDailyCap));

  const providerBadge = AI_PROVIDER_BADGE[aiProvider] ?? AI_PROVIDER_BADGE["mock"];

  async function handleSave() {
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          aiProvider,
          proposalSignature,
          autoEmailEnabled,
          autoEmailDailyCap: Number(autoEmailDailyCap) || 20,
        }),
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

      {/* AIプロンプト（別画面で編集） */}
      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-700 mb-1">AIプロンプト</h2>
        <p className="text-xs text-slate-400 mb-4">
          メール分類・人材/案件抽出・マッチ判定・提案文生成のプロンプトは「プロンプト管理」で表示・編集できます。
        </p>
        <Link
          href="/prompts"
          className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          プロンプト管理を開く →
        </Link>
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

      {/* 案件案内メールの自動送信 */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-slate-700">案件案内メールの自動送信</h2>
          <Badge tone={autoEmailEnabled ? "green" : "slate"}>
            {autoEmailEnabled ? "ON" : "OFF"}
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          毎日のマッチ後（15:40 JST）、<span className="font-medium text-slate-500">商流OK・80点以上・その日の新規・未送信</span>
          の案件案内メールを人材の紹介元へ自動送信します。過去のマッチは送信しません。
        </p>

        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={autoEmailEnabled}
            onChange={(e) => setAutoEmailEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-slate-700">自動送信を有効にする</span>
        </label>

        <div className="max-w-xs">
          <Label htmlFor="auto-cap">1日の送信上限（安全装置）</Label>
          <Input
            id="auto-cap"
            type="number"
            min={1}
            max={200}
            value={autoEmailDailyCap}
            onChange={(e) => setAutoEmailDailyCap(e.target.value)}
            disabled={!autoEmailEnabled}
            className={autoEmailEnabled ? "" : "bg-slate-50 text-slate-400"}
          />
          <p className="mt-1 text-xs text-slate-400">
            手動送信も含めて、1日にこの通数を超えたら自動送信を停止します（1〜200）。
          </p>
        </div>

        {autoEmailEnabled && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            ⚠️ 実在の取引先へ自動でメールが送られます。最初は上限を小さく（例: 5通）にして、
            送信内容・宛先が正しいか数日確認することをおすすめします。
          </div>
        )}
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
