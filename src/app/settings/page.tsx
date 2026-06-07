import { getCurrentOrg } from "@/lib/current-org";
import { DEFAULT_MATCH_PROMPT } from "@/lib/ai/prompts";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "設定 — SES Match" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const org = await getCurrentOrg();

  // Serialize for the Client Component (Date → string)
  const orgData = {
    id: org.id,
    name: org.name,
    slug: org.slug,
    aiProvider: org.aiProvider,
    proposalSignature: org.proposalSignature ?? null,
    matchPrompt: org.matchPrompt ?? null,
    createdAt: org.createdAt.toISOString(),
  };

  return (
    <div className="flex flex-col gap-6 p-6 min-h-full max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">設定</h1>
        <p className="text-sm text-slate-500 mt-1">組織・AI連携・マッチ判定プロンプト・提案メール署名の設定を行います。</p>
      </div>
      <SettingsForm org={orgData} defaultMatchPrompt={DEFAULT_MATCH_PROMPT} />
    </div>
  );
}
