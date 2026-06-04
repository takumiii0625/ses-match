"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

interface ProposalButtonProps {
  talentId: string;
  projectId: string;
}

export function ProposalButton({ talentId, projectId }: ProposalButtonProps) {
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId, projectId }),
      });
      if (!res.ok) throw new Error("生成失敗");
      const data = await res.json();
      setProposal(data.proposal ?? "");
    } catch {
      alert("提案文の生成に失敗しました");
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
      // fallback: select text
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? "コピー済み!" : "コピー"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setProposal(null)}
          >
            閉じる
          </Button>
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
