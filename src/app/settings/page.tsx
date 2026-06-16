import { getCurrentOrg } from "@/lib/current-org";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "設定 — Hermes" };

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
    autoEmailEnabled: org.autoEmailEnabled,
    autoEmailDailyCap: org.autoEmailDailyCap,
    createdAt: org.createdAt.toISOString(),
  };

  return (
    <div className="flex flex-col gap-6 p-6 min-h-full max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">設定</h1>
        <p className="text-sm text-slate-500 mt-1">組織・AI連携・提案メール署名の設定を行います。プロンプトは「プロンプト管理」で編集できます。</p>
      </div>
      <SettingsForm org={orgData} />
    </div>
  );
}
