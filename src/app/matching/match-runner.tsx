"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Project {
  id: string;
  title: string;
}

interface MatchRunnerProps {
  projects: Project[];
  selectedProjectId?: string;
}

export function MatchRunner({ projects, selectedProjectId }: MatchRunnerProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const options = projects.map((p) => ({ value: p.id, label: p.title }));

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (id) {
      router.push(`/matching?projectId=${id}`);
    } else {
      router.push("/matching");
    }
  }

  async function handleSave() {
    if (!selectedProjectId) return;
    setSaving(true);
    setSavedCount(null);
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      if (!res.ok) throw new Error("保存失敗");
      const data = await res.json();
      setSavedCount(data.matches?.length ?? 0);
      router.refresh();
    } catch {
      alert("マッチング保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="min-w-[280px]">
        <Select
          options={options}
          placeholder="案件を選択してください"
          value={selectedProjectId ?? ""}
          onChange={handleChange}
        />
      </div>
      {selectedProjectId && (
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "保存中..." : "マッチング実行＆保存"}
        </Button>
      )}
      {savedCount !== null && (
        <span className="text-sm text-emerald-600 font-medium">
          {savedCount} 件を保存しました
        </span>
      )}
    </div>
  );
}
