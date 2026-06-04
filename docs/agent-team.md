# AIエージェントチーム構成

本プロジェクトは、1体のオーケストレーター（指揮役）と4体の専門実装エージェントによる**並列開発体制**で構築しました。
各エージェントは担当ディレクトリのみを編集するよう責務分割し、ファイル衝突なく並行実装しています。

## 全体図

```
                ┌─────────────────────────────────────────┐
                │  Orchestrator（指揮役 / Claude Opus）     │
                │  ・要件定義、技術選定                      │
                │  ・共通基盤の実装                          │
                │  ・タスク分解と並列ディスパッチ            │
                │  ・統合（型チェック / ビルド / 動作検証）  │
                └───────────────┬─────────────────────────┘
                                │ 並列起動（同時実行）
      ┌───────────────┬─────────┴────────┬────────────────┐
      ▼               ▼                  ▼                ▼
┌───────────┐  ┌───────────┐     ┌───────────┐    ┌───────────┐
│ Agent A   │  │ Agent B   │     │ Agent C   │    │ Agent D   │
│ 人材      │  │ 案件      │     │ マッチング │    │ メール取込 │
└───────────┘  └───────────┘     └───────────┘    └───────────┘
```

## 共通基盤（オーケストレーターが先行実装）

並列化の前提として、全エージェントが共有する土台を先に固定しました。これにより各エージェントは
規約・型・UIを揃えられ、独立して実装できます。

| ファイル | 役割 |
|----------|------|
| `prisma/schema.prisma` | データモデル＆列挙（Organization / User / Talent / Project / Match） |
| `src/lib/prisma.ts` | Prisma クライアント singleton |
| `src/lib/enums.ts` | 列挙の日本語ラベル（単一の真実） |
| `src/lib/utils.ts` | `cn` / `formatRate` / `formatAge` |
| `src/lib/current-org.ts` | 現在組織の解決（将来の認証差し替え点） |
| `src/lib/data/talent.ts` | 人材検索クエリビルダ（他エージェントのパターン） |
| `src/lib/matching.ts` | スコアリングエンジン（純粋関数・単一の真実） |
| `src/lib/ai/` | AIサービス層（インターフェース＋モック） |
| `src/components/ui/*` | Button / Input / Select / Badge / Card |
| `prisma/seed.ts` | シードデータ |

## エージェント一覧

### Orchestrator（指揮役）
- **モデル**: Claude Opus 4.8 (1M context)
- **責務**: 参照サイト分析、要件確定、技術選定、共通基盤実装、タスク分解、4エージェントの並列ディスパッチ、統合検証（`tsc --noEmit` / `next build` / dev起動 + スクリーンショット）、GitHub公開
- **成果物**: 基盤一式、本ドキュメント、CI的な統合確認

### Agent A — 人材バーティカル
- **モデル**: Claude Sonnet 4.6
- **担当**: 自社保有人材の一覧・多軸検索・登録・詳細・編集・API
- **所有ファイル**:
  - `src/app/in-house-talent/{page,search-panel,talent-table}.tsx`
  - `src/components/talent-form.tsx`
  - `src/app/talent/new/page.tsx`、`src/app/talent/[id]/{page,delete-button}.tsx`
  - `src/app/api/talents/route.ts`、`src/app/api/talents/[id]/route.ts`

### Agent B — 案件バーティカル
- **モデル**: Claude Sonnet 4.6
- **担当**: 案件の一覧・検索・登録・詳細・編集・API、案件検索クエリ層
- **所有ファイル**:
  - `src/lib/data/project.ts`
  - `src/app/projects/{page,project-search,project-table}.tsx`
  - `src/components/project-form.tsx`
  - `src/app/projects/new/page.tsx`、`src/app/projects/[id]/{page,delete-button}.tsx`
  - `src/app/api/projects/route.ts`、`src/app/api/projects/[id]/route.ts`

### Agent C — マッチングバーティカル
- **モデル**: Claude Sonnet 4.6
- **担当**: 人材×案件のスコアリング表示、マッチ永続化、提案文生成
- **所有ファイル**:
  - `src/app/matching/{page,match-runner,proposal-button}.tsx`
  - `src/app/api/matches/route.ts`、`src/app/api/proposals/route.ts`

### Agent D — メール取り込みバーティカル
- **モデル**: Claude Sonnet 4.6
- **担当**: メール本文のAI構造化 → 人材／案件登録のUIとAPI
- **所有ファイル**:
  - `src/app/ingest/{page,ingest-form}.tsx`
  - `src/app/api/ingest/route.ts`

## 設計上の工夫

1. **責務の直交化**: 各エージェントを別ディレクトリに割り当て、編集競合をゼロに。
2. **共有点を先に固定**: スキーマ・UI・列挙・スコアリングを基盤として先行実装し、横断的な不整合を防止。
3. **単一の真実**: スコアリングは `lib/matching.ts`、ラベルは `lib/enums.ts`、検索は `lib/data/*` に集約。
4. **差し替え可能なAI層**: `AIService` インターフェース＋モック。プロバイダ実装を足すだけで本番化。
5. **統合ゲート**: 4エージェント完了後、指揮役が `tsc --noEmit`（エラー0）→ `next build`（全17ルート成功）→ dev起動 + 全ページ200 + API疎通 + スクリーンショットで品質確認。

## 並列実装の結果

- TypeScript 型チェック: **エラー 0**
- 本番ビルド: **成功（17ルート）**
- 全ページ HTTP 200、検索／マッチング／提案生成 API 疎通確認済み
