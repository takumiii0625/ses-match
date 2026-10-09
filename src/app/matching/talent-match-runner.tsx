"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/http";

export interface TalentOption {
  id: string;
  name: string;
  type: "INHOUSE" | "PARTNER";
}

/**
 * 人材起点の手動マッチ。自社保有人材・他社人材のどちらでも、1名を選んで全案件と突き合わせる。
 * 取込窓に関係なくその人材を対象にする（runMatchingForTalent）。結果は既存のマッチ結果画面で確認。
 */
export function TalentMatchRunner({ talents }: { talents: TalentOption[] }) {
  const router = useRouter();
  const [talentId, setTalentId] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ saved: number; type: "INHOUSE" | "PARTNER" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = talents.map((t) => ({
    value: t.id,
    label: `${t.type === "INHOUSE" ? "［自社保有］" : "［他社］"} ${t.name}`,
  }));

  async function handleRun() {
    if (!talentId || running) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const data = await fetchJson<{ saved?: number }>("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId }),
      });
      const type = talents.find((t) => t.id === talentId)?.type ?? "PARTNER";
      setResult({ saved: data.saved ?? 0, type });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "マッチの実行に失敗しました");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[280px] flex-1">
          <Select
            options={options}
            placeholder="人材を選択（自社保有・他社）"
            value={talentId}
            onChange={(e) => {
              setTalentId(e.target.value);
              setResult(null);
              setError(null);
            }}
          />
        </div>
        <Button variant="primary" onClick={handleRun} disabled={!talentId || running}>
          {running ? "AI判定中…（数十秒かかる場合があります）" : "この人材でマッチを実行"}
        </Button>
      </div>
      {result && (
        <p className="text-sm text-emerald-600">
          {result.saved} 件を保存しました。結果は{" "}
          <Link
            href={result.type === "INHOUSE" ? "/matches/inhouse" : "/matches"}
            className="font-medium underline hover:text-emerald-700"
          >
            {result.type === "INHOUSE" ? "自社保有人材マッチ" : "マッチ一覧"}
          </Link>{" "}
          で確認できます。
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
