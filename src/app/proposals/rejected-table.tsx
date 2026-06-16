"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export interface RejectedVM {
  id: string;
  score: number;
  talentId: string;
  talentName: string;
  projectId: string;
  projectTitle: string;
  clientName: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
}

function RestoreButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function restore() {
    if (busy) return;
    if (!window.confirm("このマッチを一覧に戻しますか？（再び送信対象になります）")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={restore}
      disabled={busy}
      className="rounded-lg border border-border px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
    >
      {busy ? "戻し中…" : "一覧に戻す"}
    </button>
  );
}

export function RejectedTable({ rows }: { rows: RejectedVM[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted">
        差し戻したマッチはありません。マッチの詳細から「差し戻し」すると、ここに理由付きで記録されます。
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-slate-50 text-xs text-slate-500">
            <th className="px-4 py-2.5 text-left font-medium">案件 / 人材</th>
            <th className="px-4 py-2.5 text-center font-medium">点数</th>
            <th className="px-4 py-2.5 text-left font-medium">差し戻し理由</th>
            <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">日付</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
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
              <td className="px-4 py-3 text-center">
                <Badge tone={r.score >= 70 ? "green" : r.score >= 40 ? "amber" : "slate"} className="tabular-nums">
                  {Math.round(r.score)}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-700">{r.rejectReason ?? "-"}</td>
              <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                {r.rejectedAt
                  ? new Date(r.rejectedAt).toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit", timeZone: "Asia/Tokyo" })
                  : "-"}
              </td>
              <td className="px-4 py-3 text-right">
                <RestoreButton matchId={r.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
