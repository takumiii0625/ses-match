import { Card } from "@/components/ui/card";

/** セクション枠 */
export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-700">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

/** KPIカード */
export function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "green" | "amber" | "red" | "indigo";
}) {
  const color =
    tone === "green"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "red"
          ? "text-red-600"
          : tone === "indigo"
            ? "text-indigo-600"
            : "text-foreground";
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={`text-2xl font-bold leading-none ${color}`}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </Card>
  );
}

/** 縦棒の時系列グラフ（CSS）。data は時系列順、x軸ラベルは間引いて表示。 */
export function BarTimeSeries({
  data,
  colorClass = "bg-primary",
  unit = "",
}: {
  data: { label: string; value: number }[];
  colorClass?: string;
  unit?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const step = Math.ceil(data.length / 6);
  return (
    <div>
      <div className="mb-1 text-xs text-muted">合計 {total}{unit}</div>
      <div className="flex h-28 items-end gap-[2px]">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex flex-1 flex-col justify-end"
            title={`${d.label}: ${d.value}${unit}`}
          >
            <div
              className={`${colorClass} rounded-t-sm`}
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-slate-400">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            {i % step === 0 ? d.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 横棒ランキング（CSS） */
export function RankList({
  items,
  colorClass = "bg-primary",
  emptyText = "データなし",
}: {
  items: { label: string; value: number; sub?: string }[];
  colorClass?: string;
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="py-4 text-sm text-muted">{emptyText}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-40 shrink-0 truncate text-slate-700" title={it.label}>
            {it.label}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
            <div className={`h-full ${colorClass}`} style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right tabular-nums text-slate-700">
            {it.value}
            {it.sub && <span className="ml-1 text-xs text-muted">{it.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 営業ファネル（各段階の数＋前段からの転換率） */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="flex flex-col gap-2">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const rate = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm text-slate-600">{s.label}</span>
            <div className="h-7 flex-1 overflow-hidden rounded bg-slate-100">
              <div
                className="flex h-full items-center justify-end bg-primary px-2 text-xs font-medium text-white"
                style={{ width: `${Math.max((s.value / max) * 100, 6)}%` }}
              >
                {s.value}
              </div>
            </div>
            <span className="w-16 shrink-0 text-right text-xs text-muted">
              {rate !== null ? `${rate}%` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 横並びの色分け内訳バー */
export function SegmentBar({
  segments,
}: {
  segments: { label: string; count: number; colorClass: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  if (total === 0) return <p className="py-2 text-sm text-muted">データなし</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-border">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.label}
              className={s.colorClass}
              style={{ width: `${(s.count / total) * 100}%` }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.colorClass}`} />
            {s.label} {s.count}
            <span className="text-muted">
              （{total ? Math.round((s.count / total) * 100) : 0}%）
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
