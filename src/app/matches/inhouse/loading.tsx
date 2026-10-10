/** 自社保有人材マッチ画面の読み込み中表示（取得・再描画の間に画面が止まって見えないように）。 */
export default function Loading() {
  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
        <span className="text-sm text-muted">自社保有人材マッチを読み込み中…</span>
      </div>
      {/* スケルトン */}
      <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
