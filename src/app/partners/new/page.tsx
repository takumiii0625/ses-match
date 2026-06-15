import Link from "next/link";
import { NewPartnerForm } from "./new-partner-form";

export const metadata = { title: "提携先を追加 — SES Match" };

export default function NewPartnerPage() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 min-h-full max-w-2xl">
      <div>
        <Link href="/partners" className="text-xs text-muted hover:text-primary">
          ← 提携先一覧
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-800">提携先を追加</h1>
        <p className="mt-1 text-sm text-muted">
          1社ずつ手動で追加します。まとめて登録する場合は
          <Link href="/partners/import" className="text-primary underline">
            CSV取込
          </Link>
          を使ってください。
        </p>
      </div>
      <NewPartnerForm />
    </div>
  );
}
