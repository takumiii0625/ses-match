import Link from "next/link";
import { getCurrentUser } from "@/lib/data/current-user";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { FavoriteButton } from "@/components/favorite-button";
import { formatRate } from "@/lib/utils";
import { TALENT_STATUS_LABELS, PROJECT_STATUS_LABELS } from "@/lib/enums";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await getCurrentUser();

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      talent: true,
      project: true,
    },
  });

  const talentFavs = favorites.filter((f) => f.talent !== null);
  const projectFavs = favorites.filter((f) => f.project !== null);

  return (
    <div className="flex flex-col gap-6 p-6 min-h-full">
      <h1 className="text-xl font-bold text-slate-800">お気に入り</h1>

      {/* お気に入り人材 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-700">
          お気に入り人材
          <span className="ml-2 text-sm font-normal text-slate-400">
            {talentFavs.length}件
          </span>
        </h2>

        {talentFavs.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-14 text-slate-400">
            <span className="text-3xl mb-2">☆</span>
            <p className="text-sm">お気に入り登録した人材がありません</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-border text-xs text-slate-500">
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">名前</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">ステータス</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">スキル</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">希望単価</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">稼働</th>
                    <th className="w-10 px-3 py-2.5 text-center font-medium">★</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {talentFavs.map((fav) => {
                    const t = fav.talent!;
                    return (
                      <tr key={fav.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                          <Link
                            href={`/talent/${t.id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {t.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Badge tone={statusTone(t.status)}>
                            {TALENT_STATUS_LABELS[t.status] ?? t.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {t.mainSkills.slice(0, 4).map((skill) => (
                              <Badge key={skill} tone="blue" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                            {t.mainSkills.length > 4 && (
                              <Badge tone="slate" className="text-xs">
                                +{t.mainSkills.length - 4}
                              </Badge>
                            )}
                            {t.mainSkills.length === 0 && (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap font-medium text-xs">
                          {formatRate(t.desiredRateMin, t.desiredRateMax)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                          {t.availabilityText || "-"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <FavoriteButton talentId={t.id} initial={true} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* お気に入り案件 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-700">
          お気に入り案件
          <span className="ml-2 text-sm font-normal text-slate-400">
            {projectFavs.length}件
          </span>
        </h2>

        {projectFavs.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-14 text-slate-400">
            <span className="text-3xl mb-2">☆</span>
            <p className="text-sm">お気に入り登録した案件がありません</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-border text-xs text-slate-500">
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap min-w-[180px]">案件名</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">ステータス</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">エンド/商流</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap min-w-[160px]">必須スキル</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">単価</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">開始</th>
                    <th className="w-10 px-3 py-2.5 text-center font-medium">★</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projectFavs.map((fav) => {
                    const p = fav.project!;
                    return (
                      <tr key={fav.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/projects/${p.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {p.title}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Badge tone={statusTone(p.status)}>
                            {PROJECT_STATUS_LABELS[p.status] ?? p.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                          {p.clientName ?? "-"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {p.requiredSkills.slice(0, 4).map((s) => (
                              <Badge key={s} tone="indigo" className="text-xs">
                                {s}
                              </Badge>
                            ))}
                            {p.requiredSkills.length > 4 && (
                              <Badge tone="slate" className="text-xs">
                                +{p.requiredSkills.length - 4}
                              </Badge>
                            )}
                            {p.requiredSkills.length === 0 && (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 text-xs whitespace-nowrap font-medium">
                          {formatRate(p.rateMin, p.rateMax)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 text-xs whitespace-nowrap">
                          {p.startText ?? "-"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <FavoriteButton projectId={p.id} initial={true} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
