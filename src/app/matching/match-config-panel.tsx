"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  type MatchConfig,
  type Emphasis,
  type GateToggles,
  type Weights,
} from "@/lib/match-config";

const GATE_META: { key: keyof GateToggles; label: string; desc: string }[] = [
  { key: "channel", label: "商流・契約形態", desc: "貴社止まり/再委託不可/個人事業主不可/商流の深さ" },
  { key: "language", label: "必須言語", desc: "案件の必須言語（Java/PHP等）を持たない人材" },
  { key: "rate", label: "単価", desc: "希望単価が案件上限＋許容を超える人材" },
  { key: "location", label: "勤務地", desc: "出社あり案件×地方不一致（両方確実なときのみ）" },
  { key: "nationality", label: "国籍", desc: "日本人のみ案件×外国籍" },
  { key: "coverage", label: "スキルのカバー率", desc: "必須スキルの充足割合が閾値未満" },
];

const WEIGHT_META: { key: keyof Weights; label: string }[] = [
  { key: "skills", label: "必須スキルの充足" },
  { key: "rate", label: "単価の整合" },
  { key: "availability", label: "稼働開始時期" },
  { key: "remote", label: "リモート/出社条件" },
  { key: "experience", label: "経験年数・担当役割・語学" },
  { key: "ageNationality", label: "年齢・国籍" },
];

const EMPHASIS_OPTIONS: { value: Emphasis; label: string }[] = [
  { value: "high", label: "重視" },
  { value: "normal", label: "標準" },
  { value: "low", label: "軽視" },
];

/**
 * マッチ設定パネル（A:除外ゲートON/OFF・B:カバー率閾値・C:点数要素の比重・D:独自ルール）。
 * 保存すると組織設定(matchConfig)に書き込み、次回以降の再マッチ・日次自動マッチ・自動送信に反映。
 * ※ 単価許容(万)と必須言語ANY/ALLは、案件ごとの結果一覧の上にある「即フィルタ」カードで調整・保存します。
 */
export function MatchConfigPanel({
  initialConfig,
  initialRateTolerance,
}: {
  initialConfig: MatchConfig;
  initialRateTolerance: number;
}) {
  const [gates, setGates] = useState<GateToggles>(initialConfig.gates);
  const [minCoverage, setMinCoverage] = useState(String(Math.round(initialConfig.minCoverage * 100)));
  const [rateTolerance, setRateTolerance] = useState(String(initialRateTolerance));
  const [weights, setWeights] = useState<Weights>(initialConfig.weights);
  const [rules, setRules] = useState(initialConfig.customRules);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setGate(key: keyof GateToggles, v: boolean) {
    setGates((g) => ({ ...g, [key]: v }));
    setMsg(null);
  }
  function setWeight(key: keyof Weights, v: Emphasis) {
    setWeights((w) => ({ ...w, [key]: v }));
    setMsg(null);
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    const cov = Math.min(100, Math.max(0, Number(minCoverage) || 0)) / 100;
    const tol = Math.min(100, Math.max(0, Math.floor(Number(rateTolerance) || 0)));
    const config: MatchConfig = {
      gates,
      minCoverage: cov,
      weights,
      customRules: rules.map((r) => ({ text: r.text.trim(), exclude: r.exclude })).filter((r) => r.text),
    };
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchConfig: config, rateToleranceMan: tol }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMsg("保存しました（次回の再マッチ・自動送信から反映されます）");
    } catch {
      setMsg("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <details>
        <summary className="cursor-pointer text-base font-semibold text-slate-700">
          マッチ設定（除外ルール・比重・独自ルール）
        </summary>

        <p className="mt-2 text-xs text-muted">
          マッチで「何を除外し、何を点数で見るか」を設定します。ここでの変更は保存後の再マッチ・日次自動マッチ・自動送信に反映されます
          （既存の保存済みマッチは作り直しません）。
        </p>

        {/* A. 除外ゲート */}
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-slate-700">① 除外ルール（チェック＝満たさない人材を除外）</h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GATE_META.map((g) => (
              <label key={g.key} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
                <input
                  type="checkbox"
                  checked={gates[g.key]}
                  onChange={(e) => setGate(g.key, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-slate-700">
                  {g.label}で除外
                  <span className="block text-xs text-slate-400">{g.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {gates.rate && (
            <div className="mt-3 max-w-xs">
              <Label htmlFor="rate-tol-panel">単価の許容超過（万円）</Label>
              <Input
                id="rate-tol-panel"
                type="number"
                min={0}
                max={100}
                value={rateTolerance}
                onChange={(e) => {
                  setRateTolerance(e.target.value);
                  setMsg(null);
                }}
              />
              <p className="mt-1 text-xs text-slate-400">
                人材の希望単価が「案件の想定単価上限＋この値」までなら許可（例: 5＝案件上限＋5万まで）。
                これを超える人材を除外。安い人材は常に許可。
              </p>
            </div>
          )}
          {gates.coverage && (
            <div className="mt-3 max-w-xs">
              <Label htmlFor="min-cov">カバー率の閾値（%）</Label>
              <Input
                id="min-cov"
                type="number"
                min={0}
                max={100}
                value={minCoverage}
                onChange={(e) => {
                  setMinCoverage(e.target.value);
                  setMsg(null);
                }}
              />
              <p className="mt-1 text-xs text-slate-400">必須スキルのうちこの割合以上を満たさない人材を除外（既定50%）。</p>
            </div>
          )}
        </section>

        {/* C. 比重 */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700">② 点数の比重（AIが優先度を付ける際の重み）</h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {WEIGHT_META.map((w) => (
              <div key={w.key} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5">
                <span className="text-sm text-slate-700">{w.label}</span>
                <Select
                  options={EMPHASIS_OPTIONS}
                  value={weights[w.key]}
                  onChange={(e) => setWeight(w.key, e.target.value as Emphasis)}
                  className="w-24"
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            比重はAI（マッチ判定）に指示として渡します。厳密な数値計算ではなく相対的な強さです。
          </p>
        </section>

        {/* D. 独自ルール */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-slate-700">③ 独自ルールの追加</h3>
          <p className="mt-1 text-xs text-slate-400">
            自由記述の条件を追加できます。「除外」にチェックすると該当者を提案不可に、外すと点数への加減点に使います。
            例:「金融業務の経験が必須」「夜間対応ができること」。
          </p>
          <div className="mt-2 space-y-2">
            {rules.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={r.text}
                  placeholder="条件を入力（例: 金融業務の経験が必須）"
                  onChange={(e) => {
                    const v = e.target.value;
                    setRules((rs) => rs.map((x, j) => (j === i ? { ...x, text: v } : x)));
                    setMsg(null);
                  }}
                />
                <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={r.exclude}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setRules((rs) => rs.map((x, j) => (j === i ? { ...x, exclude: v } : x)));
                      setMsg(null);
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  除外
                </label>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRules((rs) => rs.filter((_, j) => j !== i));
                    setMsg(null);
                  }}
                >
                  削除
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => setRules((rs) => [...rs, { text: "", exclude: false }])}
          >
            ＋ ルールを追加
          </Button>
        </section>

        <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "マッチ設定を保存"}
          </Button>
          {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        </div>
      </details>
    </Card>
  );
}
