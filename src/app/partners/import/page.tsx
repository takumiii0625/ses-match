import { ImportForm } from "./import-form";

export const metadata = { title: "提携先CSV取込 — Hermes" };
export const dynamic = "force-dynamic";

export default function PartnerImportPage() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 min-h-full max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">提携先CSV取込</h1>
        <p className="mt-1 text-sm text-muted">
          BLASTMAILの書き出しCSV（会社名・メール・配信状態）を取り込みます。
          会社名・メールで重複は自動マージされ、何度取り込んでも増えません。
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
