"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type TalentOption = { id: string; name: string };
type ProjectOption = { id: string; title: string };

interface Props {
  talents: TalentOption[];
  projects: ProjectOption[];
}

const TYPE_OPTIONS = [
  { value: "TALENT", label: "人材" },
  { value: "PROJECT", label: "案件" },
  { value: "TALENT_LIST", label: "人材一覧" },
];

export function CreateLinkForm({ talents, projects }: Props) {
  const router = useRouter();
  const [type, setType] = useState("TALENT");
  const [targetId, setTargetId] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const needsTarget = type === "TALENT" || type === "PROJECT";

  const targetOptions =
    type === "TALENT"
      ? talents.map((t) => ({ value: t.id, label: t.name }))
      : type === "PROJECT"
        ? projects.map((p) => ({ value: p.id, label: p.title }))
        : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNewUrl(null);
    setCopied(false);

    if (needsTarget && !targetId) {
      setError("対象を選択してください。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/shared-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          targetId: needsTarget ? targetId : undefined,
          label: label.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました。");
        return;
      }
      setNewUrl(data.url as string);
      setTargetId("");
      setLabel("");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!newUrl) return;
    try {
      await navigator.clipboard.writeText(window.location.origin + newUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      <h2 className="text-base font-semibold text-slate-800 mb-4">
        新しい公開リンクを発行
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="link-type">種別</Label>
            <Select
              id="link-type"
              options={TYPE_OPTIONS}
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setTargetId("");
              }}
            />
          </div>

          {needsTarget && (
            <div>
              <Label htmlFor="link-target">
                {type === "TALENT" ? "人材" : "案件"}
              </Label>
              <Select
                id="link-target"
                options={targetOptions}
                placeholder="選択してください"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              />
            </div>
          )}

          <div className={needsTarget ? "" : "sm:col-span-2"}>
            <Label htmlFor="link-label">ラベル（任意）</Label>
            <Input
              id="link-label"
              placeholder="例: 〇〇社向け共有"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={loading} size="md">
            {loading ? "発行中..." : "発行"}
          </Button>
        </div>
      </form>

      {newUrl && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <span className="flex-1 text-sm text-slate-700 font-mono break-all">
            {newUrl}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? "コピー済み" : "コピー"}
          </Button>
        </div>
      )}
    </div>
  );
}
