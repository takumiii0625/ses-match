import Link from "next/link";
import { IngestForm } from "../../ingest/ingest-form";

export const metadata = { title: "自社保有案件をテキストから登録 — Caduceus" };

export default function InHouseProjectPastePage() {
  return (
    <div className="flex flex-col gap-6 p-6 min-h-full">
      <div>
        <div className="mb-1 flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">自社保有案件をテキストから登録</h1>
          <Link
            href="/in-house-project"
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            ← 一覧へ
          </Link>
        </div>
        <p className="text-sm text-muted">
          案件メールの本文を貼り付けると、AIが項目を抽出します。内容を確認・編集して
          <span className="font-medium">自社保有案件</span>として登録できます（自社案件マッチの対象になります）。
        </p>
      </div>
      <IngestForm lockedType="project" own />
    </div>
  );
}
