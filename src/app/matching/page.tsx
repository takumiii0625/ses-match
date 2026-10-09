import { getCurrentOrg } from "@/lib/current-org";
import { parseMatchConfig } from "@/lib/match-config";
import { MatchConfigPanel } from "./match-config-panel";

export const dynamic = "force-dynamic";

export default async function MatchingPage() {
  const org = await getCurrentOrg();
  const matchConfig = parseMatchConfig(org.matchConfig);

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">マッチング設定</h1>
        <p className="mt-1 text-sm text-muted">
          マッチの除外ルール・単価許容・必須言語・比重・独自ルールを設定します。
          保存すると、日次自動マッチ・各マッチ画面・自動送信に反映されます（既存の保存済みマッチは作り直しません）。
        </p>
      </div>
      <MatchConfigPanel
        initialConfig={matchConfig}
        initialRateTolerance={org.rateToleranceMan}
        initialLanguageMatchAll={org.languageMatchAll}
      />
    </div>
  );
}
