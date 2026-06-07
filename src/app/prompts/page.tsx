import { getCurrentOrg } from "@/lib/current-org";
import { PROMPT_FIELDS } from "@/lib/ai/prompts";
import { PromptsEditor, type PromptField } from "./prompts-editor";

export const metadata = { title: "プロンプト管理 — SES Match" };
export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const org = await getCurrentOrg();
  const orgRecord = org as unknown as Record<string, string | null>;

  const prompts: PromptField[] = PROMPT_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    description: f.description,
    default: f.default,
    value: orgRecord[f.key] ?? null,
  }));

  const aiProvider = org.aiProvider;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">プロンプト管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          メール分類・情報抽出・マッチ判定・提案文生成に使うLLMプロンプトを表示・編集できます。
          空にして保存すると組み込みデフォルトに戻ります。
        </p>
        {aiProvider === "mock" && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            現在のAIプロバイダーは「モック」のため、これらのプロンプトは実際の判定には使われません（設定でAnthropicに切り替えると有効になります）。
          </p>
        )}
      </div>
      <PromptsEditor prompts={prompts} />
    </div>
  );
}
