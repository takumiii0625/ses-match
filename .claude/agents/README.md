# SES Match 専用エージェントチーム

このリポジトリ専用のサブエージェント定義。今後の Claude Code セッションで `Agent` ツールから役割別に呼び出せる。

| エージェント | 役割 | こんな時に |
|---|---|---|
| **cost-guardian** | LLMコストの番人。モデル選択・トークン・展開数・対象窓をレビュー | AI呼び出しを足す/変える前後、コスト調査、暴走防止 |
| **matching-engineer** | マッチング（事前フィルタ・商流・名寄せ・窓・スコア・自社/他社）の実装 | マッチ件数や採用ロジックの変更 |
| **ingest-extractor** | メール取込＋AI抽出（Gmail・プロンプト/スキーマ・PDF・重複/ページング） | 取込が動かない／所属・性別・商流が取れない／取込コスト調整 |
| **qa-verifier** | 出荷前の型/テスト/ビルド検証と git 規約（README退行/個別add）の番人 | コミット/プッシュ前、「テストした?」の確認 |

## 共通の地雷（全員が守る）
- **既定モデルは最安 `claude-haiku-4-5`**。自動/高頻度経路で高価モデルを既定にしない（過去に $11/回の事故）。
- **`git add -A` / `git add .` 禁止**（ワークツリーの README.md は boilerplate 退行）。個別 add。
- 変更は `npx tsc --noEmit` ＋ `pnpm test`（依存/ビルド影響時は `pnpm build`）を通す。
- コミット末尾に `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

教訓の詳細はユーザーのメモリ（`cost-blowup-llm-default-pitfall`, `ses-match-cost-controls`）参照。
