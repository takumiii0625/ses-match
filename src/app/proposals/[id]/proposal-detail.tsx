"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export type ProposalStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";

const STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: "下書き",
  SENT: "送信済み",
  ACCEPTED: "受諾",
  REJECTED: "見送り",
};

const STATUS_TONE: Record<ProposalStatus, "slate" | "blue" | "green" | "red"> = {
  DRAFT: "slate",
  SENT: "blue",
  ACCEPTED: "green",
  REJECTED: "red",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

interface ProposalDetailProps {
  proposalId: string;
  initialBody: string;
  initialStatus: ProposalStatus;
  initialSubject?: string | null;
}

export function ProposalDetail({
  proposalId,
  initialBody,
  initialStatus,
  initialSubject,
}: ProposalDetailProps) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [status, setStatus] = useState<ProposalStatus>(initialStatus);
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, proposalBody: body, subject: subject || undefined }),
      });
      if (!res.ok) throw new Error("保存失敗");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } catch {
      alert("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("この提案を削除しますか？")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除失敗");
      router.push("/proposals");
    } catch {
      alert("削除に失敗しました");
      setDeleting(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op
    }
  }

  return (
    <div className="space-y-4">
      {/* Status selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 font-medium shrink-0">ステータス</span>
        <div className="w-40">
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => setStatus(e.target.value as ProposalStatus)}
          />
        </div>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>
      </div>

      {/* Subject field */}
      <div>
        <label className="block text-xs text-slate-500 font-medium mb-1">件名（任意）</label>
        <input
          type="text"
          className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="提案件名を入力..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      {/* Body editor */}
      <div>
        <label className="block text-xs text-slate-500 font-medium mb-1">提案本文</label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="font-mono text-xs resize-y leading-relaxed"
          placeholder="提案文を入力..."
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 items-center pt-1">
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "コピー済み!" : "コピー"}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "削除中..." : "削除"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-700">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            保存しました
          </span>
        )}
      </div>
    </div>
  );
}
