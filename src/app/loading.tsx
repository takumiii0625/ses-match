// ルート共通のローディングUI。
// App Router は loading.tsx があると、遷移開始と同時にこれを即表示し、
// 新ルートのサーバ描画（DB/LLM）完了を待つ間も画面が固まらない。
// これが無いと「ボタンを押しても画面が変わらない＝遅い」と感じる主因になる。
export default function Loading() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-10">
      <div className="flex items-center gap-3 text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
        <span className="text-sm font-medium">読み込み中…</span>
      </div>
    </div>
  );
}
