import { Card } from "@/components/ui/card";

export function Placeholder({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-bold text-slate-800">{title}</h1>
      <Card className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-primary">
          準備中
        </span>
        <p className="text-sm text-slate-500">
          {description ?? "この機能は現在開発中です。"}
        </p>
      </Card>
    </div>
  );
}
