import { TestMailView } from "./test-mail-view";

export const metadata = { title: "テスト送信 — Caduceus" };
export const dynamic = "force-dynamic";

export default function TestMailPage() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 min-h-full max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">テスト送信</h1>
        <p className="mt-1 text-sm text-muted">
          ランダムなマッチ（提案可・80点以上）の案件案内メールを表示し、
          <span className="font-medium"> t.yoshioka@obfall.co.jp </span>
          宛にテスト送信します（実際の紹介元には送りません・送信履歴にも残りません）。
        </p>
      </div>
      <TestMailView />
    </div>
  );
}
