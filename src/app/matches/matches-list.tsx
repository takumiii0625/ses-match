"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Columns2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatRate, daysAgo } from "@/lib/utils";
import { REMOTE_LABELS } from "@/lib/enums";
import { ProposalButton } from "../matching/proposal-button";

// サーバから渡る軽量ビューモデル（Prisma型から必要分だけ抜き出して直列化）。
export interface MatchVM {
  id: string;
  score: number;
  reasons: string[];
  talent: {
    id: string;
    name: string;
    mainSkills: string[];
    skills: string[];
    desiredRateMin: number | null;
    desiredRateMax: number | null;
    remotePreference: string | null;
    receivedDate: string | null;
  };
  project: {
    id: string;
    title: string;
    clientName: string | null;
    rateMin: number | null;
    rateMax: number | null;
    requiredSkills: string[];
    receivedDate: string | null;
  };
}

const SCORE_OPTIONS = [
  { value: "0", label: "すべての点数" },
  { value: "50", label: "50点以上" },
  { value: "60", label: "60点以上" },
  { value: "70", label: "70点以上" },
  { value: "80", label: "80点以上" },
];

function scoreBadgeTone(score: number): "green" | "amber" | "slate" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "slate";
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="mt-1 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, score)}%` }}
      />
    </div>
  );
}

/** reasons[] を「合致点」と「懸念点」に振り分ける。 */
function splitReasons(reasons: string[]): { strengths: string[]; concerns: string[] } {
  const strengths: string[] = [];
  const concerns: string[] = [];
  for (const r of reasons) {
    if (r.startsWith("懸念:")) concerns.push(r.replace(/^懸念:\s*/, ""));
    else strengths.push(r);
  }
  return { strengths, concerns };
}

export function MatchesList({ matches }: { matches: MatchVM[] }) {
  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState("0");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Number(minScore);
    return matches.filter((m) => {
      if (m.score < min) return false;
      if (!q) return true;
      const hay = [
        m.project.title,
        m.project.clientName ?? "",
        m.talent.name,
        ...m.talent.mainSkills,
        ...m.talent.skills,
        ...m.project.requiredSkills,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [matches, query, minScore]);

  // 案件ごとにグループ化（案件は最高スコア順）。
  const groups = useMemo(() => {
    const byProject = new Map<string, { project: MatchVM["project"]; rows: MatchVM[] }>();
    for (const m of filtered) {
      const g = byProject.get(m.project.id);
      if (g) g.rows.push(m);
      else byProject.set(m.project.id, { project: m.project, rows: [m] });
    }
    return [...byProject.values()].sort(
      (a, b) => (b.rows[0]?.score ?? 0) - (a.rows[0]?.score ?? 0),
    );
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* フィルタ */}
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[240px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            案件名・人材名・スキルで検索
          </label>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: Java / 田中 / ◯◯案件"
          />
        </div>
        <div className="w-44">
          <label className="mb-1 block text-xs font-medium text-slate-500">点数</label>
          <Select
            options={SCORE_OPTIONS}
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
          />
        </div>
        {(query || minScore !== "0") && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setMinScore("0");
            }}
            className="h-10 text-sm text-slate-500 underline hover:text-slate-700"
          >
            クリア
          </button>
        )}
      </Card>

      <div className="px-1 text-sm font-medium text-muted">
        {filtered.length} 件のマッチ（{groups.length} 案件）
        {filtered.length !== matches.length && (
          <span className="ml-1 text-xs">/ 全 {matches.length} 件中</span>
        )}
      </div>

      {groups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          {matches.length === 0 ? (
            <>
              まだ保存済みのマッチがありません。
              <Link href="/matching" className="ml-1 text-primary underline">
                マッチングを実行
              </Link>
              してください。
            </>
          ) : (
            "条件に一致するマッチがありません。フィルタを変えてください。"
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ project, rows }) => (
            <Card key={project.id} className="overflow-hidden p-0">
              {/* 案件ヘッダー */}
              <div className="border-b border-border bg-slate-50/60 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-semibold text-foreground hover:text-primary hover:underline"
                  >
                    {project.title}
                  </Link>
                  <Badge tone="slate">{rows.length}名マッチ</Badge>
                  {project.clientName && (
                    <span className="text-xs text-muted">
                      クライアント: {project.clientName}
                    </span>
                  )}
                  {(project.rateMin != null || project.rateMax != null) && (
                    <span className="text-xs text-muted">
                      単価: {formatRate(project.rateMin, project.rateMax)}
                    </span>
                  )}
                  <span className="text-xs text-muted">配信: {daysAgo(project.receivedDate)}</span>
                  <Link
                    href={`/compare?mode=project&projectId=${project.id}`}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-border hover:bg-slate-50 hover:text-primary"
                  >
                    <Columns2 className="h-3.5 w-3.5" /> 見比べる
                  </Link>
                </div>
                {project.requiredSkills.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-xs text-muted">必須スキル:</span>
                    {project.requiredSkills.map((s) => (
                      <Badge key={s} tone="indigo">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* マッチ人材 */}
              <div className="divide-y divide-border">
                {rows.map((m) => {
                  const { strengths, concerns } = splitReasons(m.reasons);
                  const t = m.talent;
                  return (
                    <div key={m.id} className="flex items-start gap-4 px-5 py-4">
                      <div className="w-14 shrink-0 text-center">
                        <div className="text-lg font-bold tabular-nums text-slate-700">
                          {Math.round(m.score)}
                          <span className="text-xs font-normal text-slate-400">点</span>
                        </div>
                        <ScoreBar score={m.score} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/talent/${t.id}`}
                            className="font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {t.name}
                          </Link>
                          <Badge tone={scoreBadgeTone(m.score)} className="tabular-nums">
                            {Math.round(m.score)}点
                          </Badge>
                          {(t.desiredRateMin != null || t.desiredRateMax != null) && (
                            <span className="text-xs text-muted">
                              希望単価: {formatRate(t.desiredRateMin, t.desiredRateMax)}
                            </span>
                          )}
                          {t.remotePreference && (
                            <span className="text-xs text-muted">
                              {REMOTE_LABELS[t.remotePreference] ?? t.remotePreference}
                            </span>
                          )}
                          <span className="text-xs text-muted">配信: {daysAgo(t.receivedDate)}</span>
                        </div>

                        {/* スキル */}
                        {(t.mainSkills.length > 0 || t.skills.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {t.mainSkills.map((s) => (
                              <Badge key={s} tone="blue">
                                {s}
                              </Badge>
                            ))}
                            {t.skills
                              .filter((s) => !t.mainSkills.includes(s))
                              .slice(0, 6)
                              .map((s) => (
                                <Badge key={s} tone="slate">
                                  {s}
                                </Badge>
                              ))}
                          </div>
                        )}

                        {/* マッチ根拠（何を基準にマッチしたか） */}
                        {strengths.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {strengths.map((r, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700"
                              >
                                ✓ {r}
                              </span>
                            ))}
                          </div>
                        )}
                        {concerns.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {concerns.map((r, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700"
                              >
                                ⚠ {r}
                              </span>
                            ))}
                          </div>
                        )}
                        {strengths.length === 0 && concerns.length === 0 && (
                          <p className="mt-2 text-xs text-slate-400">
                            判定根拠は記録されていません。
                          </p>
                        )}

                        {/* アクション: 提案へ進む / 見比べる */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <ProposalButton talentId={t.id} projectId={project.id} />
                          <Link
                            href={`/compare?mode=talent&talentId=${t.id}`}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-border hover:bg-slate-50 hover:text-primary"
                          >
                            <Columns2 className="h-3.5 w-3.5" /> この人材を見比べ
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
