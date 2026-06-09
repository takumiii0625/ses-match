import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getConnection } from "@/lib/email/gmail";
import { getCurrentOrg } from "@/lib/current-org";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RunButton } from "./run-button";
import { ReextractButton } from "./reextract-button";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";

const KIND_LABELS: Record<string, string> = {
  TALENT: "人材",
  PROJECT: "案件",
  IGNORE: "対象外",
  ERROR: "エラー",
};
const KIND_TONE: Record<string, "green" | "blue" | "slate" | "red"> = {
  TALENT: "green",
  PROJECT: "blue",
  IGNORE: "slate",
  ERROR: "red",
};

export default async function MailPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const org = await getCurrentOrg();
  const connection = await getConnection();
  const hasGoogleCreds =
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

  const logs = await prisma.ingestedEmail.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const connected = sp.connected === "1";
  const errorMsg = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold text-slate-800">メール自動取り込み</h1>
      </div>

      {connected && (
        <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          Gmail連携が完了しました。
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          連携エラー: {errorMsg}
        </div>
      )}

      {/* Connection status */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-800">連携状態</h2>
        {!hasGoogleCreds ? (
          <div className="flex items-start gap-2 text-sm text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Google API の設定が未完了です。</p>
              <p className="mt-1 text-slate-500">
                <code>.env</code> に <code>GOOGLE_CLIENT_ID</code> /{" "}
                <code>GOOGLE_CLIENT_SECRET</code> を設定してください（手順は管理者へ）。
              </p>
            </div>
          </div>
        ) : connection ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> 連携済み
            </span>
            <span className="text-sm text-slate-600">{connection.account}</span>
            <a href="/api/google/auth">
              <Button variant="outline" size="sm">
                再連携
              </Button>
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              受信メール（sales@ 宛）を自動で人材・案件に取り込みます。Gmailと連携してください。
            </p>
            <a href="/api/google/auth" className="w-fit">
              <Button>Gmailと連携する</Button>
            </a>
          </div>
        )}
      </Card>

      {/* Run */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-800">取り込み実行</h2>
        <p className="mb-3 text-sm text-slate-500">
          新着メールを取得し、AIで「人材／案件／対象外」に分類して登録します。
          {process.env.CRON_SECRET
            ? "（定期実行はCronで自動化されます）"
            : "（定期実行はデプロイ後にCronで自動化できます）"}
        </p>
        <RunButton disabled={!connection} />
      </Card>

      {/* 既存データの再抽出 */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-800">所属・性別の再抽出</h2>
        <p className="mb-3 text-sm text-slate-500">
          抽出機能を追加する前に取り込んだ人材について、保存済みメール本文からAIで
          所属・性別を補完します（未設定のみ・既存の値は上書きしません）。
        </p>
        <ReextractButton />
      </Card>

      {/* Log */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">
            取り込み履歴
            <span className="ml-2 text-sm font-normal text-slate-400">
              {logs.length}件
            </span>
          </h2>
        </div>
        {logs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            まだ取り込み履歴がありません。
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">区分</th>
                <th className="px-4 py-2.5 text-left font-medium">件名</th>
                <th className="px-4 py-2.5 text-left font-medium">差出人</th>
                <th className="px-4 py-2.5 text-left font-medium">判定理由</th>
                <th className="px-4 py-2.5 text-left font-medium">登録</th>
                <th className="px-4 py-2.5 text-left font-medium">日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Badge tone={KIND_TONE[l.kind] ?? "slate"}>
                      {KIND_LABELS[l.kind] ?? l.kind}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-800">{l.subject ?? "-"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{l.fromAddr ?? "-"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{l.reason ?? "-"}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {l.talentId ? (
                      <Link href={`/talent/${l.talentId}`} className="text-primary hover:underline">
                        人材へ
                      </Link>
                    ) : l.projectId ? (
                      <Link href={`/projects/${l.projectId}`} className="text-primary hover:underline">
                        案件へ
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500">
                    {l.createdAt.toLocaleString("ja-JP", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
