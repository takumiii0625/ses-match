import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentOrg } from "@/lib/current-org";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatRate } from "@/lib/utils";
import { ProposalDetail } from "./proposal-detail";
import type { ProposalStatus } from "@prisma/client";

const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: "下書き",
  SENT: "送信済み",
  ACCEPTED: "受諾",
  REJECTED: "見送り",
};

const PROPOSAL_STATUS_TONE: Record<ProposalStatus, "slate" | "blue" | "green" | "red"> = {
  DRAFT: "slate",
  SENT: "blue",
  ACCEPTED: "green",
  REJECTED: "red",
};

export default async function ProposalDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const org = await getCurrentOrg();

  const proposal = await prisma.proposal.findFirst({
    where: { id, orgId: org.id },
    include: {
      talent: {
        select: {
          id: true,
          name: true,
          mainSkills: true,
          skills: true,
          desiredRateMin: true,
          desiredRateMax: true,
          availabilityText: true,
        },
      },
      project: {
        select: {
          id: true,
          title: true,
          clientName: true,
          requiredSkills: true,
          rateMin: true,
          rateMax: true,
        },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!proposal) notFound();

  return (
    <div className="flex flex-col gap-6 p-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/proposals"
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            ← 提案管理
          </Link>
          <h1 className="text-xl font-bold text-slate-800">
            {proposal.subject || `${proposal.project.title} × ${proposal.talent.name}`}
          </h1>
          <Badge tone={PROPOSAL_STATUS_TONE[proposal.status]}>
            {PROPOSAL_STATUS_LABELS[proposal.status]}
          </Badge>
        </div>
      </div>

      {/* Summary */}
      <Card className="p-5">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">案件</dt>
            <dd className="text-slate-800 font-medium">
              <Link href={`/projects/${proposal.project.id}`} className="hover:text-primary hover:underline">
                {proposal.project.title}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">エンド / 商流元</dt>
            <dd className="text-slate-800">{proposal.project.clientName ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">人材</dt>
            <dd className="text-slate-800 font-medium">
              <Link href={`/talent/${proposal.talent.id}`} className="hover:text-primary hover:underline">
                {proposal.talent.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">マッチスコア</dt>
            <dd>
              {proposal.score != null ? (
                <Badge tone={proposal.score >= 70 ? "green" : proposal.score >= 40 ? "amber" : "slate"}>
                  {Math.round(proposal.score)} / 100
                </Badge>
              ) : (
                <span className="text-slate-400">-</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">人材 希望単価</dt>
            <dd className="text-slate-800">
              {formatRate(proposal.talent.desiredRateMin, proposal.talent.desiredRateMax)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">案件 単価</dt>
            <dd className="text-slate-800">
              {formatRate(proposal.project.rateMin, proposal.project.rateMax)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">稼働開始</dt>
            <dd className="text-slate-800">{proposal.talent.availabilityText ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 mb-0.5">作成日</dt>
            <dd className="text-slate-800 text-xs">
              {proposal.createdAt.toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              })}
            </dd>
          </div>
        </dl>

        {proposal.talent.mainSkills.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-1.5">主要スキル</div>
            <div className="flex flex-wrap gap-1.5">
              {proposal.talent.mainSkills.map((s) => (
                <Badge key={s} tone="indigo">{s}</Badge>
              ))}
            </div>
          </div>
        )}

        {proposal.project.requiredSkills.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1.5">案件 必須スキル</div>
            <div className="flex flex-wrap gap-1.5">
              {proposal.project.requiredSkills.map((s) => (
                <Badge key={s} tone="blue">{s}</Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Editable proposal body + actions */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-700 mb-4">提案内容</h2>
        <ProposalDetail
          proposalId={proposal.id}
          initialBody={proposal.body}
          initialStatus={proposal.status as "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED"}
          initialSubject={proposal.subject}
        />
      </Card>
    </div>
  );
}
