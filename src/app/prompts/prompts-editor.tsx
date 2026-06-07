"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchJson } from "@/lib/http";

export interface PromptField {
  key: string;
  label: string;
  description: string;
  default: string;
  value: string | null; // 組織の保存値（null=デフォルト使用中）
}

export function PromptsEditor({ prompts }: { prompts: PromptField[] }) {
  const router = useRouter();
  const [active, setActive] = useState(prompts[0]?.key ?? "");
  // key → 現在の編集テキスト（未設定はデフォルトを初期値に）
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(prompts.map((p) => [p.key, p.value ?? p.default])),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const current = prompts.find((p) => p.key === active);
  const defaults = Object.fromEntries(prompts.map((p) => [p.key, p.default]));

  function setText(key: string, v: string) {
    setTexts((cur) => ({ ...cur, [key]: v }));
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    setIsError(false);
    try {
      // 全プロンプトを送信（空＝デフォルトに戻す扱いはサーバ側）。
      await fetchJson("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(texts),
      });
      setMsg("プロンプトを保存しました。");
      router.refresh();
    } catch (e) {
      setIsError(true);
      setMsg(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  if (!current) return null;

  return (
    <div className="space-y-4">
      {/* タブ */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {prompts.map((p) => {
          const isDefault = (texts[p.key] ?? "").trim() === p.default.trim();
          return (
            <button
              key={p.key}
              onClick={() => setActive(p.key)}
              className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium ${
                active === p.key
                  ? "border-b-2 border-primary text-primary"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {p.label}
              {!isDefault && (
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" title="カスタム" />
              )}
            </button>
          );
        })}
      </div>

      {/* 編集エリア */}
      <Card className="p-6">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-700">{current.label}</h2>
          <Badge
            tone={
              (texts[current.key] ?? "").trim() === current.default.trim()
                ? "slate"
                : "indigo"
            }
          >
            {(texts[current.key] ?? "").trim() === current.default.trim()
              ? "デフォルト"
              : "カスタム"}
          </Badge>
        </div>
        <p className="mb-4 text-xs text-slate-400">{current.description}</p>

        <Textarea
          rows={20}
          value={texts[current.key] ?? ""}
          onChange={(e) => setText(current.key, e.target.value)}
          className="resize-y font-mono text-xs leading-relaxed"
        />

        <div className="mt-2">
          <button
            type="button"
            onClick={() => setText(current.key, defaults[current.key])}
            disabled={(texts[current.key] ?? "").trim() === current.default.trim()}
            className="text-xs text-slate-500 underline hover:text-slate-700 disabled:cursor-default disabled:no-underline disabled:opacity-40"
          >
            このプロンプトをデフォルトに戻す
          </button>
        </div>
      </Card>

      {/* アクション */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </Button>
        {msg && (
          <span
            className={`text-sm font-medium ${isError ? "text-red-600" : "text-emerald-600"}`}
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
