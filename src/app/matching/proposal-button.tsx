"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { fetchJson } from "@/lib/http";

interface ProposalButtonProps {
  talentId: string;
  projectId: string;
}

export function ProposalButton({ talentId, projectId }: ProposalButtonProps) {
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setSavedId(null);
    try {
      const data = await fetchJson<{ proposal?: string }>("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId, projectId }),
      });
      setProposal(data.proposal ?? "");
    } catch (e) {
      alert(e instanceof Error ? e.message : "提案文の生成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!proposal) return;
    try {
      await navigator.clipboard.writeText(proposal);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: no-op
    }
  }

  async function handleSave() {
    if (!proposal) return;
    setSaving(true);
    try {
      const data = await fetchJson<{ id?: string }>("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", talentId, projectId, proposalBody: proposal }),
      });
      setSavedId(data.id ?? null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "提案の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  if (proposal !== null) {
    return (
      <div className="mt-3 space-y-2">
        <Textarea
          value={proposal}
          onChange={(e) => setProposal(e.target.value)}
          rows={8}
          className="text-xs font-mono resize-y"
        />
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? "コピー済み!" : "コピー"}
          </Button>
          {!savedId && (
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setProposal(null); setSavedId(null); }}>
            閉じる
          </Button>
          {savedId && (
            <span className="flex items-center gap-2 text-xs text-emerald-700">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              保存しました
              <Link href="/proposals" className="underline text-primary hover:text-blue-700 transition-colors">
                提案管理で見る →
              </Link>
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleGenerate}
      disabled={loading}
    >
      {loading ? "生成中..." : "提案文を生成"}
    </Button>
  );
}
