import { prisma } from "@/lib/prisma";
import { formatRate } from "@/lib/utils";
import { REMOTE_LABELS } from "@/lib/enums";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface Props {
  params: Promise<{ token: string }>;
}

// ---------------------------------------------------------------
// Helper: small section row
// ---------------------------------------------------------------
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-3 py-2 border-b border-border last:border-0">
      <dt className="w-32 shrink-0 text-xs font-medium text-slate-500">
        {label}
      </dt>
      <dd className="flex-1 text-sm text-slate-800 break-words">
        {value || <span className="text-slate-400">-</span>}
      </dd>
    </div>
  );
}

function SkillBadges({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-sm text-slate-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <Badge key={s} tone="blue">
          {s}
        </Badge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// Page
// ---------------------------------------------------------------
export default async function SharePage({ params }: Props) {
  const { token } = await params;

  // Look up the link
  const link = await prisma.sharedLink.findUnique({ where: { token } });

  // Expired or missing
  if (
    !link ||
    (link.expiresAt && link.expiresAt < new Date())
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-sm w-full p-8 text-center">
          <p className="text-4xl mb-4">🔗</p>
          <h1 className="text-lg font-bold text-slate-800 mb-2">
            リンクが無効です
          </h1>
          <p className="text-sm text-slate-500">
            このリンクは存在しないか、有効期限が切れています。
          </p>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // TALENT
  // ---------------------------------------------------------------
  if (link.type === "TALENT" && link.targetId) {
    const talent = await prisma.talent.findUnique({
      where: { id: link.targetId },
    });

    if (!talent) {
      return <InvalidLink />;
    }

    return (
      <PageShell title={talent.name}>
        <dl>
          <Row label="稼働開始" value={talent.availabilityText} />
          <Row
            label="希望単価"
            value={formatRate(talent.desiredRateMin, talent.desiredRateMax)}
          />
          <Row
            label="リモート"
            value={
              talent.remotePreference
                ? REMOTE_LABELS[talent.remotePreference]
                : null
            }
          />
          <Row label="最寄り駅" value={talent.nearestStation} />
          <div className="flex gap-3 py-2 border-b border-border">
            <dt className="w-32 shrink-0 text-xs font-medium text-slate-500 pt-0.5">
              主なスキル
            </dt>
            <dd className="flex-1">
              <SkillBadges items={talent.mainSkills} />
            </dd>
          </div>
          <div className="flex gap-3 py-2 border-b border-border">
            <dt className="w-32 shrink-0 text-xs font-medium text-slate-500 pt-0.5">
              スキル
            </dt>
            <dd className="flex-1">
              <SkillBadges items={talent.skills} />
            </dd>
          </div>
          {talent.note && (
            <div className="flex gap-3 py-2">
              <dt className="w-32 shrink-0 text-xs font-medium text-slate-500 pt-0.5">
                備考
              </dt>
              <dd className="flex-1 text-sm text-slate-800 whitespace-pre-wrap">
                {talent.note}
              </dd>
            </div>
          )}
        </dl>
      </PageShell>
    );
  }

  // ---------------------------------------------------------------
  // PROJECT
  // ---------------------------------------------------------------
  if (link.type === "PROJECT" && link.targetId) {
    const project = await prisma.project.findUnique({
      where: { id: link.targetId },
    });

    if (!project) {
      return <InvalidLink />;
    }

    return (
      <PageShell title={project.title}>
        <dl>
          <Row label="クライアント" value={project.clientName} />
          <Row
            label="単価"
            value={formatRate(project.rateMin, project.rateMax)}
          />
          <Row
            label="リモート"
            value={
              project.remotePreference
                ? REMOTE_LABELS[project.remotePreference]
                : null
            }
          />
          <Row label="勤務地" value={project.location} />
          <Row label="開始時期" value={project.startText} />
          <div className="flex gap-3 py-2 border-b border-border">
            <dt className="w-32 shrink-0 text-xs font-medium text-slate-500 pt-0.5">
              必須スキル
            </dt>
            <dd className="flex-1">
              <SkillBadges items={project.requiredSkills} />
            </dd>
          </div>
          {project.description && (
            <div className="flex gap-3 py-2">
              <dt className="w-32 shrink-0 text-xs font-medium text-slate-500 pt-0.5">
                案件概要
              </dt>
              <dd className="flex-1 text-sm text-slate-800 whitespace-pre-wrap">
                {project.description}
              </dd>
            </div>
          )}
        </dl>
      </PageShell>
    );
  }

  // ---------------------------------------------------------------
  // TALENT_LIST
  // ---------------------------------------------------------------
  if (link.type === "TALENT_LIST") {
    const talents = await prisma.talent.findMany({
      where: { orgId: link.orgId, talentType: "INHOUSE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        mainSkills: true,
        desiredRateMin: true,
        desiredRateMax: true,
        remotePreference: true,
        availabilityText: true,
      },
    });

    return (
      <PageShell title="人材一覧">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-slate-500">
                <th className="pb-3 pr-4">氏名</th>
                <th className="pb-3 pr-4">主なスキル</th>
                <th className="pb-3 pr-4">単価</th>
                <th className="pb-3 pr-4">リモート</th>
                <th className="pb-3">稼働開始</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {talents.map((t) => (
                <tr
                  key={t.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="py-3 pr-4 font-medium text-slate-800">
                    {t.name}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {t.mainSkills.slice(0, 4).map((s) => (
                        <Badge key={s} tone="blue">
                          {s}
                        </Badge>
                      ))}
                      {t.mainSkills.length > 4 && (
                        <Badge tone="slate">
                          +{t.mainSkills.length - 4}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {formatRate(t.desiredRateMin, t.desiredRateMax)}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {t.remotePreference
                      ? REMOTE_LABELS[t.remotePreference]
                      : "-"}
                  </td>
                  <td className="py-3 text-slate-600">
                    {t.availabilityText ?? "-"}
                  </td>
                </tr>
              ))}
              {talents.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-slate-400"
                  >
                    人材データがありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageShell>
    );
  }

  return <InvalidLink />;
}

// ---------------------------------------------------------------
// Shared layout shell (no sidebar dependency)
// ---------------------------------------------------------------
function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Mini header */}
        <div className="mb-6 flex items-center gap-2">
          <span className="text-primary font-bold text-sm">Κηρύκειον</span>
          <span className="text-slate-300">|</span>
          <span className="text-xs text-slate-400">公開プロフィール</span>
        </div>

        <Card className="p-6">
          <h1 className="text-xl font-bold text-slate-800 mb-5">{title}</h1>
          {children}
        </Card>

        <p className="mt-4 text-center text-xs text-slate-400">
          このページはΚηρύκειονより共有されたリード専用ページです。
        </p>
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-sm w-full p-8 text-center">
        <p className="text-4xl mb-4">🔗</p>
        <h1 className="text-lg font-bold text-slate-800 mb-2">
          リンクが無効です
        </h1>
        <p className="text-sm text-slate-500">
          このリンクは存在しないか、有効期限が切れています。
        </p>
      </Card>
    </div>
  );
}
