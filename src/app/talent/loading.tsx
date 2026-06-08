// /talent/[id]（編集）・/talent/new（新規）の遷移中に即表示する骨組み。
// 遷移と同時にフォーム形のスケルトンを出し、サーバ描画/フォーム読込の待ちを体感的に隠す。
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-4 rounded-xl border border-border bg-white p-5">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="space-y-1.5">
                <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
                <div className="h-9 w-full animate-pulse rounded-lg bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
