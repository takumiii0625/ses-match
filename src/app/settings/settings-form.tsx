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
  matchPrompt: string | null;
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

export function SettingsForm({
  org,
  defaultMatchPrompt,
}: {
  org: Org;
  defaultMatchPrompt: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState(org.name);
  const [aiProvider, setAiProvider] = useState(org.aiProvider);
  const [proposalSignature, setProposalSignature] = useState(org.proposalSignature ?? "");
  // 未設定（null）のときはデフォルトプロンプトを編集の初期値として見せる。
  const [matchPrompt, setMatchPrompt] = useState(org.matchPrompt ?? defaultMatchPrompt);
  const usingDefault = matchPrompt.trim() === defaultMatchPrompt.trim();

  const providerBadge = AI_PROVIDER_BADGE[aiProvider] ?? AI_PROVIDER_BADGE["mock"];

  async function handleSave() {
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, aiProvider, proposalSignature, matchPrompt }),
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

      {/* マッチ判定プロンプト */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-slate-700">マッチ判定プロンプト</h2>
          <Badge tone={usingDefault ? "slate" : "indigo"}>
            {usingDefault ? "デフォルト" : "カスタム"}
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          LLMが人材×案件の適合度（スコア・推奨度・合致点/懸念点）を判定する際のシステムプロンプトです。
          取込後の自動マッチ・「全件マッチ」・マッチング画面のAI判定で使われます。
          {aiProvider === "mock" && (
            <span className="block text-amber-600 mt-1">
              ※ 現在のAIプロバイダーは「モック」のため、このプロンプトは判定に使われません（Anthropicに切替で有効）。
            </span>
          )}
        </p>
        <Label htmlFor="match-prompt">システムプロンプト</Label>
        <Textarea
          id="match-prompt"
          rows={16}
          value={matchPrompt}
          onChange={(e) => setMatchPrompt(e.target.value)}
          className="resize-y font-mono text-xs leading-relaxed"
        />
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setMatchPrompt(defaultMatchPrompt)}
            disabled={usingDefault}
            className="text-xs text-slate-500 hover:text-slate-700 underline disabled:opacity-40 disabled:no-underline disabled:cursor-default"
          >
            デフォルトに戻す
          </button>
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
