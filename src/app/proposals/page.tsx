import Link from "next/link";
import { getCurrentOrg } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ProposalStatus } from "@prisma/client";

const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: "下書き",
  SENT: "送信済み",
  ACCEPTED: "受諾",
  REJECTED: "見送り",
};

const PROPOSAL_STATUS_TONE: Record<ProposalStatus, "slate" | "blue" | "green" | "red" | "amber" | "indigo"> = {
  DRAFT: "slate",
  SENT: "blue",
  ACCEPTED: "green",
  REJECTED: "red",
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "すべて" },
  { value: "DRAFT", label: "下書き" },
  { value: "SENT", label: "送信済み" },
  { value: "ACCEPTED", label: "受諾" },
  { value: "REJECTED", label: "見送り" },
];

export default async function ProposalsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const statusFilter = (typeof sp.status === "string" ? sp.status : "") as ProposalStatus | "";

  const org = await getCurrentOrg();

  const proposals = await prisma.proposal.findMany({
    where: {
      orgId: org.id,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      talent: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, clientName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-5 p-6 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">提案管理</h1>
          <span className="text-sm text-slate-500 font-normal">
            {proposals.length} 件
          </span>
        </div>
        <Link
          href="/matching"
          className="text-sm text-primary hover:underline transition-colors"
        >
          ＋ マッチングから提案を作成
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_FILTERS.map((f) => {
          const isActive =
            f.value === "" ? statusFilter === "" : statusFilter === f.value;
          const href = f.value ? `/proposals?status=${f.value}` : "/proposals";
          return (
            <Link
              key={f.value}
              href={href}
              className={[
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              ].join(" ")}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* Empty state */}
      {proposals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-slate-400 text-sm">提案がまだありません</p>
          <Link
            href="/matching"
            className="text-sm text-primary hover:underline"
          >
            マッチング画面で提案文を生成 →
          </Link>
        </div>
      )}

      {/* Proposals table */}
      {proposals.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">案件</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">人材</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">スコア</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">ステータス</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">作成日</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {proposals.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-800 font-medium">
                    <Link
                      href={`/projects/${p.project.id}`}
                      className="hover:text-primary hover:underline transition-colors"
                    >
                      {p.project.title}
                    </Link>
                    {p.project.clientName && (
                      <div className="text-xs text-slate-400 mt-0.5">{p.project.clientName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <Link
                      href={`/talent/${p.talent.id}`}
                      className="hover:text-primary hover:underline transition-colors"
                    >
                      {p.talent.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {p.score != null ? (
                      <Badge tone={p.score >= 70 ? "green" : p.score >= 40 ? "amber" : "slate"}>
                        {Math.round(p.score)}
                      </Badge>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={PROPOSAL_STATUS_TONE[p.status]}>
                      {PROPOSAL_STATUS_LABELS[p.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {p.createdAt.toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/proposals/${p.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
