"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PIPELINE_STAGES, type StageKey } from "@/lib/pipeline";

export interface PipelineVM {
  id: string;
  score: number;
  talentId: string;
  talentName: string;
  projectId: string;
  projectTitle: string;
  clientName: string | null;
  sentInfoAt: string | null; // 案件案内メール送信日時
  sentTalentAt: string | null; // 要員提案メール送信日時
  stages: Record<StageKey, boolean>;
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" });
}

function StageCheck({
  matchId,
  stage,
  initial,
}: {
  matchId: string;
  stage: StageKey;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next); // 楽観的更新
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, on: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setOn(!next); // 失敗したら戻す
    } finally {
      setBusy(false);
    }
  }

  return (
    <input
      type="checkbox"
      checked={on}
      disabled={busy}
      onChange={toggle}
      className="h-4 w-4 rounded border-slate-300"
    />
  );
}

export function ProposalPipeline({ rows }: { rows: PipelineVM[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted">
        メールを送信したマッチがまだありません。マッチ一覧や見比べからメールを送ると、ここで進捗を管理できます。
      </Card>
    );
  }
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-slate-50 text-xs text-slate-500">
            <th className="px-3 py-2.5 text-left font-medium">案件 / 人材</th>
            <th className="px-3 py-2.5 text-center font-medium">点数</th>
            <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">送信</th>
            {PIPELINE_STAGES.map((s) => (
              <th key={s.key} className="px-3 py-2.5 text-center font-medium whitespace-nowrap">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5">
                <Link href={`/projects/${r.projectId}`} className="font-medium text-slate-800 hover:text-primary hover:underline">
                  {r.projectTitle}
                </Link>
                {r.clientName && <span className="ml-1 text-xs text-slate-400">{r.clientName}</span>}
                <div className="mt-0.5 text-xs text-slate-500">
                  <Link href={`/talent/${r.talentId}`} className="hover:text-primary hover:underline">
                    {r.talentName}
                  </Link>
                </div>
              </td>
              <td className="px-3 py-2.5 text-center">
                <Badge tone={r.score >= 70 ? "green" : r.score >= 40 ? "amber" : "slate"} className="tabular-nums">
                  {Math.round(r.score)}
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-center text-xs whitespace-nowrap">
                {r.sentInfoAt && <div className="text-sky-700">案内 {fmt(r.sentInfoAt)}</div>}
                {r.sentTalentAt && <div className="text-emerald-700">提案 {fmt(r.sentTalentAt)}</div>}
                {!r.sentInfoAt && !r.sentTalentAt && <span className="text-slate-300">-</span>}
              </td>
              {PIPELINE_STAGES.map((s) => (
                <td key={s.key} className="px-3 py-2.5 text-center">
                  <StageCheck matchId={r.id} stage={s.key} initial={r.stages[s.key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
