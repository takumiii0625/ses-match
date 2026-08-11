import { Card } from "@/components/ui/card";

export interface DailyMatchStat {
  day: string; // "YYYY-MM-DD"（JST）
  total: number; // その日にマッチした件数
  rejected: number; // うち差し戻し
  proposed: number; // うち提案（メール送信済み・差し戻しでない）
}

/** "YYYY-MM-DD" → "M/D(曜)"。 */
function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
  return `${m}/${d}(${dow})`;
}

const CHART_H = 200; // バー領域の高さ(px)

/**
 * 日別のマッチ件数を積み上げ棒グラフで表示。
 * 縦＝その日のマッチ件数、内訳＝提案(緑)／差し戻し(赤)／未対応(灰)。横＝日付。
 */
export function MatchAnalysisChart({ data }: { data: DailyMatchStat[] }) {
  const totalMatches = data.reduce((s, d) => s + d.total, 0);
  const totalProposed = data.reduce((s, d) => s + d.proposed, 0);
  const totalRejected = data.reduce((s, d) => s + d.rejected, 0);
  const totalPending = totalMatches - totalProposed - totalRejected;
  const maxTotal = Math.max(1, ...data.map((d) => d.total));
  const pct = (n: number) => (totalMatches ? Math.round((n / totalMatches) * 100) : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* サマリー */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="マッチ総数" value={totalMatches} tone="slate" />
        <Stat label="提案" value={totalProposed} sub={`${pct(totalProposed)}%`} tone="emerald" />
        <Stat label="差し戻し" value={totalRejected} sub={`${pct(totalRejected)}%`} tone="rose" />
        <Stat label="未対応" value={totalPending} sub={`${pct(totalPending)}%`} tone="muted" />
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <LegendItem className="bg-emerald-500" label="提案" />
        <LegendItem className="bg-rose-400" label="差し戻し" />
        <LegendItem className="bg-slate-300" label="未対応" />
      </div>

      {/* 棒グラフ */}
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">対象期間にマッチがありません。</p>
      ) : (
        <Card className="overflow-x-auto p-4">
          <div className="flex items-end gap-2" style={{ minHeight: CHART_H + 28 }}>
            {data.map((d) => {
              const pending = Math.max(0, d.total - d.rejected - d.proposed);
              const h = (n: number) => Math.round((n / maxTotal) * CHART_H);
              const title = `${fmtDay(d.day)}  マッチ${d.total} / 提案${d.proposed} / 差し戻し${d.rejected} / 未対応${pending}`;
              return (
                <div key={d.day} className="flex w-9 shrink-0 flex-col items-center gap-1">
                  {/* 件数（バー上） */}
                  <span className="text-[10px] tabular-nums text-slate-500">{d.total || ""}</span>
                  {/* 積み上げバー（下から: 提案→差し戻し→未対応） */}
                  <div
                    className="flex w-6 flex-col justify-end overflow-hidden rounded-t bg-slate-50"
                    style={{ height: CHART_H }}
                    title={title}
                  >
                    <div className="w-full bg-slate-300" style={{ height: h(pending) }} />
                    <div className="w-full bg-rose-400" style={{ height: h(d.rejected) }} />
                    <div className="w-full bg-emerald-500" style={{ height: h(d.proposed) }} />
                  </div>
                  {/* 日付ラベル */}
                  <span className="whitespace-nowrap text-[10px] leading-tight text-slate-500">
                    {fmtDay(d.day)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <p className="text-xs text-muted">
        ※ 縦＝その日にマッチした件数（母数はマッチ一覧と同じ＝他社人材・80点以上・商流提案可）。
        内訳は「提案（案内/提案メールを送信済み）」「差し戻し」「未対応（未送信・未差し戻し）」。
        マッチ日（マッチが作られた日・JST）で集計。バーにカーソルを合わせると内訳が出ます。
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: "slate" | "emerald" | "rose" | "muted";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "rose"
        ? "text-rose-500"
        : tone === "muted"
          ? "text-slate-400"
          : "text-foreground";
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border p-3">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-2xl font-bold leading-none ${color}`}>
        {value.toLocaleString("ja-JP")}
      </span>
      {sub && <span className="mt-0.5 text-xs text-muted">{sub}</span>}
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
