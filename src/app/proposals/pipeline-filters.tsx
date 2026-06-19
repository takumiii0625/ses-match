"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { PIPELINE_STAGES } from "@/lib/pipeline";

const STAGE_OPTIONS = [
  { value: "", label: "進捗: すべて" },
  { value: "none", label: "進捗: 未着手" },
  ...PIPELINE_STAGES.map((s) => ({ value: s.key, label: `進捗: ${s.label}` })),
];

const PERIOD_OPTIONS = [
  { value: "", label: "期間: 全期間" },
  { value: "7", label: "期間: 直近7日" },
  { value: "30", label: "期間: 直近30日" },
  { value: "90", label: "期間: 直近90日" },
];

/** パイプライン専用フィルタ（進捗・期間）。URLの ?stage= ?period= を更新する。 */
export function PipelineFilters({ stage, period }: { stage: string; period: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  function set(key: "stage" | "period", value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.replace(`/proposals?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap gap-2">
      <div className="w-44">
        <Select options={STAGE_OPTIONS} value={stage} onChange={(e) => set("stage", e.target.value)} />
      </div>
      <div className="w-40">
        <Select options={PERIOD_OPTIONS} value={period} onChange={(e) => set("period", e.target.value)} />
      </div>
    </div>
  );
}
