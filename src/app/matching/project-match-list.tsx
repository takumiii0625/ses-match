"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatRate, daysAgo } from "@/lib/utils";
import { channelStatus } from "@/lib/channel";
import { REMOTE_LABELS, TALENT_STATUS_LABELS } from "@/lib/enums";

export interface ProjectMatchVM {
  id: string;
  score: number;
  reasons: string[];
  proposable: boolean;
  channelNote: string | null;
  dupes: number;
  talent: {
    id: string;
    name: string;
    status: string;
    desiredRateMin: number | null;
    desiredRateMax: number | null;
    availabilityText: string | null;
    remotePreference: string | null;
    nearestStation: string | null;
    affiliation: string | null;
    mainSkills: string[];
    skills: string[];
    receivedDate: string | null;
  };
}

function scoreBadgeTone(score: number): "green" | "amber" | "slate" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "slate";
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
    </div>
  );
}

function splitReasons(reasons: string[]) {
  const strengths: string[] = [];
  const concerns: string[] = [];
  for (const r of reasons) {
    if (r.startsWith("懸念:")) concerns.push(r.replace(/^懸念:\s*/, ""));
    else strengths.push(r);
  }
  return { strengths, concerns };
}

/**
 * 案件の保存済みマッチを表示。単価の許容超過マージン(万円)で即時フィルタできる。
 * - 人材の希望単価が「案件上限＋許容」を超えるマッチを隠す（安い人材・単価不明は常に表示）。
 * - 「既定として保存」で組織設定(rateToleranceMan)に保存し、再マッチ・自動送信の足切りにも反映。
 */
export function ProjectMatchList({
  matches,
  projectRateMax,
  initialTolerance,
  proposalSlot,
}: {
  matches: ProjectMatchVM[];
  projectRateMax: number | null;
  initialTolerance: number;
  // ProposalButton はサーバー側で生成して talentId をキーに差し込む。
  proposalSlot: Record<string, React.ReactNode>;
}) {
  const [tolerance, setTolerance] = useState(String(initialTolerance));
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const tol = Math.max(0, Number(tolerance) || 0);

  const visible = useMemo(() => {
    if (projectRateMax == null) return matches; // 案件上限不明 → 単価で絞れない
    return matches.filter((m) => {
      const want = m.talent.desiredRateMin;
      if (want == null) return true; // 希望単価不明 → 通す
      return want <= projectRateMax + tol;
    });
  }, [matches, projectRateMax, tol]);

  const hidden = matches.length - visible.length;

  async function handleSaveDefault() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateToleranceMan: tol }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSavedMsg("保存しました（再マッチ・自動送信にも反映されます）");
    } catch {
      setSavedMsg("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* 単価の許容範囲コントロール */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-40">
            <Label htmlFor="rate-tol">単価の許容超過（万円）</Label>
            <Input
              id="rate-tol"
              type="number"
              min={0}
              max={100}
              value={tolerance}
              onChange={(e) => {
                setTolerance(e.target.value);
                setSavedMsg(null);
              }}
            />
          </div>
          <p className="flex-1 text-xs text-muted">
            {projectRateMax != null ? (
              <>
                案件上限 <span className="font-medium">{projectRateMax}万</span> ＋許容{" "}
                <span className="font-medium">{tol}万</span> ＝ 希望{" "}
                <span className="font-medium">{projectRateMax + tol}万</span> まで表示。
                これを超える人材は隠します（安い人材・単価不明は常に表示）。
              </>
            ) : (
              <>この案件は想定単価上限が未設定のため、単価での絞り込みはできません。</>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleSaveDefault} disabled={saving}>
              {saving ? "保存中…" : "既定として保存"}
            </Button>
            {savedMsg && <span className="text-xs text-emerald-600">{savedMsg}</span>}
          </div>
        </div>
      </Card>

      <div className="px-1 text-sm font-medium text-muted">
        {visible.length} 件{hidden > 0 && <span className="text-slate-400">（単価超過で {hidden} 件を非表示）</span>}
      </div>

      {visible.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          表示できるマッチがありません。許容超過マージンを上げるか、「AIで再判定」を実行してください。
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((m, idx) => {
            const talent = m.talent;
            const { strengths, concerns } = splitReasons(m.reasons);
            const cs = channelStatus(m.proposable, m.channelNote);
            return (
              <Card key={m.id} className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-8 flex-shrink-0 text-center">
                    <span className="text-lg font-bold text-slate-300">{idx + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/talent/${talent.id}`}
                        className="font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {talent.name}
                      </Link>
                      <Badge tone={scoreBadgeTone(m.score)} className="tabular-nums">
                        {Math.round(m.score)}点
                      </Badge>
                      {cs ? <Badge tone={cs.tone}>{cs.label}</Badge> : null}
                      {m.dupes > 1 && <Badge tone="slate">同一{m.dupes}件</Badge>}
                      {talent.status !== "NONE" && (
                        <Badge tone="slate">
                          {TALENT_STATUS_LABELS[talent.status] ?? talent.status}
                        </Badge>
                      )}
                    </div>

                    <ScoreBar score={m.score} />

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      {(talent.desiredRateMin != null || talent.desiredRateMax != null) && (
                        <span>希望単価: {formatRate(talent.desiredRateMin, talent.desiredRateMax)}</span>
                      )}
                      {talent.availabilityText && <span>稼働開始: {talent.availabilityText}</span>}
                      {talent.remotePreference && (
                        <span>{REMOTE_LABELS[talent.remotePreference] ?? talent.remotePreference}</span>
                      )}
                      {talent.nearestStation && <span>最寄: {talent.nearestStation}</span>}
                      {talent.affiliation && <span>所属: {talent.affiliation}</span>}
                      <span>配信: {daysAgo(talent.receivedDate)}</span>
                    </div>

                    {(talent.mainSkills.length > 0 || talent.skills.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {talent.mainSkills.map((s) => (
                          <Badge key={s} tone="blue">{s}</Badge>
                        ))}
                        {talent.skills
                          .filter((s) => !talent.mainSkills.includes(s))
                          .slice(0, 6)
                          .map((s) => (
                            <Badge key={s} tone="slate">{s}</Badge>
                          ))}
                      </div>
                    )}

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
                    {m.channelNote &&
                      (m.proposable ? (
                        <p className="mt-2 text-xs text-slate-500">商流: {m.channelNote}</p>
                      ) : (
                        <div className="mt-2">
                          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs text-red-700">
                            提案不可の理由: {m.channelNote}
                          </span>
                        </div>
                      ))}

                    <div className="mt-3">{proposalSlot[talent.id]}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
