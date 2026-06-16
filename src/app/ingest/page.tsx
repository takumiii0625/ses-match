import { IngestForm } from "./ingest-form";

export const metadata = {
  title: "メール取り込み | Caduceus",
};

export default function IngestPage() {
  return (
    <div className="flex flex-col gap-6 p-6 min-h-full">
      <div>
        <h1 className="text-xl font-bold text-slate-800">メール取り込み</h1>
        <p className="mt-1 text-sm text-muted">
          メール本文を貼り付けると、AIが人材・案件情報を自動で構造化します。
        </p>
      </div>
      <IngestForm />
    </div>
  );
}
