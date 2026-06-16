"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TALENT_STATUS_LABELS, GENDER_LABELS, REMOTE_LABELS } from "@/lib/enums";
import { formatRate, formatAge } from "@/lib/utils";
import { FavoriteButton } from "@/components/favorite-button";
import { TalentDrawer } from "@/components/talent-drawer";

interface Attachment {
  id: string;
  filename: string;
  url: string;
}
interface User {
  id: string;
  name: string;
}
interface Talent {
  id: string;
  managementId?: string | null;
  status: string;
  talentType?: string | null;
  assignee?: User | null;
  name: string;
  age?: number | null;
  gender?: string | null;
  affiliation?: string | null;
  employmentType?: string | null;
  nationality?: string | null;
  japaneseLevel?: string | null;
  englishLevel?: string | null;
  availabilityText?: string | null;
  desiredRateMin?: number | null;
  desiredRateMax?: number | null;
  mainSkills: string[];
  skills: string[];
  remotePreference?: string | null;
  nearestStation?: string | null;
  note?: string | null;
  emailSubject?: string | null;
  distributionSubject?: string | null;
  kishaOk?: boolean | null;
  emailBody?: string | null;
  sourceEmail?: string | null;
  summaryText?: string | null;
  attachments: Attachment[];
}

interface TalentTableProps {
  talents: Talent[];
  total: number;
  favoriteTalentIds?: Set<string>;
}

export function TalentTable({ talents, total, favoriteTalentIds = new Set() }: TalentTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openTalent, setOpenTalent] = useState<Talent | null>(null);

  function toggleAll() {
    if (selected.size === talents.length) setSelected(new Set());
    else setSelected(new Set(talents.map((t) => t.id)));
  }
  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-white">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-700">{total}件</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
              配信日｜最新順
            </span>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700">
              自社保有人材のみ
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/talent/new">
            <Button variant="primary" size="sm">新規人材登録</Button>
          </Link>
          <Button variant="outline" size="sm">公開リンク</Button>
          <Button variant="danger" size="sm" disabled={selected.size === 0}>一括削除</Button>
          <Button variant="outline" size="sm">表示項目</Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs text-slate-500">
              <th className="w-10 px-3 py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={selected.size === talents.length && talents.length > 0}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">管理ID</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">ステータス</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">担当者</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">名前</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">年齢</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">性別</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">所属</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">稼働</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">希望単価</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">スキル</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">リモート希望</th>
              <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">最寄り駅</th>
              <th className="w-8 px-3 py-2.5 text-center font-medium">添付</th>
              <th className="w-10 px-3 py-2.5 text-center font-medium">★</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {talents.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-12 text-center text-slate-400 text-sm">
                  該当する人材が見つかりませんでした
                </td>
              </tr>
            ) : (
              talents.map((talent) => (
                <tr
                  key={talent.id}
                  onClick={() => setOpenTalent(talent)}
                  className={`cursor-pointer transition-colors ${
                    openTalent?.id === talent.id ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-3 py-2.5 text-center" onClick={stop}>
                    <input
                      type="checkbox"
                      checked={selected.has(talent.id)}
                      onChange={() => toggleOne(talent.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 font-mono text-xs whitespace-nowrap">
                    {talent.managementId || "-"}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Badge tone={statusTone(talent.status)}>
                      {TALENT_STATUS_LABELS[talent.status] ?? talent.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                    {talent.assignee?.name ?? "-"}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                    {talent.name}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{formatAge(talent.age)}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                    {talent.gender ? GENDER_LABELS[talent.gender] ?? "-" : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap max-w-[120px] truncate" title={talent.affiliation ?? undefined}>
                    {talent.affiliation || "-"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{talent.availabilityText || "-"}</td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap font-medium">
                    {formatRate(talent.desiredRateMin, talent.desiredRateMax)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {talent.mainSkills.slice(0, 3).map((skill) => (
                        <Badge key={skill} tone="blue" className="text-xs">{skill}</Badge>
                      ))}
                      {talent.mainSkills.length > 3 && (
                        <Badge tone="slate" className="text-xs">+{talent.mainSkills.length - 3}</Badge>
                      )}
                      {talent.mainSkills.length === 0 && <span className="text-slate-400">-</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                    {talent.remotePreference ? REMOTE_LABELS[talent.remotePreference] ?? "-" : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{talent.nearestStation || "-"}</td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                    {talent.attachments.length > 0 ? (
                      <span className="text-slate-500 text-xs" title={`${talent.attachments.length}件`}>📎</span>
                    ) : (
                      <span className="text-slate-200 text-xs">📎</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center" onClick={stop}>
                    <FavoriteButton talentId={talent.id} initial={favoriteTalentIds.has(talent.id)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-white">
        <span className="text-xs text-slate-500">全 {total} 件</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>前へ</Button>
          <span className="text-xs text-slate-600">Page 1 / 1</span>
          <Button variant="outline" size="sm" disabled>次へ</Button>
        </div>
      </div>

      {openTalent && (
        <TalentDrawer talent={openTalent} onClose={() => setOpenTalent(null)} />
      )}
    </Card>
  );
}
