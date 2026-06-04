# SES Match

SES業界向けの **人材・案件マッチング自動化プラットフォーム**。
メールに埋もれた人材／案件情報を構造化し、多軸検索・マッチング・提案文生成までを一気通貫で支援します。

> AISES（aises.ai）の業務ドメインを参考に、機能をゼロから独自実装したものです。コード・ブランド資産の流用はありません。

## 主な機能

| 機能 | 説明 | 画面 |
|------|------|------|
| 自社保有人材 | 人材DB。スキル・単価・リモート希望(8段階)・稼働開始・語学など多軸検索 | `/in-house-talent` |
| 案件管理 | 案件(商流・必須スキル・単価・勤務地)の登録と検索 | `/projects` |
| マッチング | 人材×案件をスコアリング(スキル60/単価20/リモート10/稼働10)。提案文を自動生成 | `/matching` |
| メール取り込み | メール本文をAIが構造化 → 人材／案件として登録 | `/ingest` |

## 技術スタック

- **Next.js 16** (App Router / Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4**（独自UIコンポーネント）
- **Prisma 6** + **PostgreSQL**（Docker）
- **AIサービス層**：インターフェース＋モック実装。`AI_PROVIDER` とAPIキーを設定すれば本番LLMに差し替え可能（`src/lib/ai/`）

## セットアップ

```bash
# 1. 依存インストール
pnpm install

# 2. PostgreSQL 起動（Docker）
pnpm db:up

# 3. マイグレーション
pnpm db:migrate

# 4. シードデータ投入
pnpm db:seed

# 5. 開発サーバー
pnpm dev
# → http://localhost:3000
```

`.env`（`.env.example` 参照）:

```
DATABASE_URL="postgresql://ses:ses@localhost:5433/sesmatch?schema=public"
# AI_PROVIDER=anthropic   # 省略時はモック実装で動作
# ANTHROPIC_API_KEY=...
```

## スクリプト

| コマンド | 内容 |
|----------|------|
| `pnpm dev` | 開発サーバー |
| `pnpm build` | 本番ビルド |
| `pnpm db:up` | Postgres 起動 |
| `pnpm db:migrate` | マイグレーション |
| `pnpm db:seed` | シード投入 |
| `pnpm db:reset` | DBリセット＋再シード |
| `pnpm db:studio` | Prisma Studio |

## アーキテクチャ

```
src/
  app/
    in-house-talent/   人材一覧・多軸検索（Server Component + 検索パネル）
    talent/            人材 登録・詳細・編集
    projects/          案件 一覧・登録・詳細
    matching/          マッチング（スコアリング表示＋提案生成）
    ingest/            メール取り込み（AI構造化）
    api/               talents / projects / matches / proposals / ingest
  components/ui/       Button, Input, Select, Badge, Card ...
  lib/
    prisma.ts          Prisma クライアント
    enums.ts           列挙ラベル（日本語）
    data/              検索クエリビルダ（talent / project）
    matching.ts        スコアリングエンジン（純粋関数）
    ai/                AIサービス層（mock / 差し替え可能）
    current-org.ts     現在の組織（将来 認証に差し替え）
```

開発体制（AIエージェントチーム構成）は [`docs/agent-team.md`](docs/agent-team.md) を参照。

## 今後の拡張ポイント

- 認証（Auth0 / Clerk）とマルチテナント本格対応（`current-org.ts` を差し替え）
- AIプロバイダ実装（`src/lib/ai/` に Anthropic / OpenAI を追加）
- 実メール連携（IMAP / Gmail API → `/api/ingest`）
- 添付ファイルストレージ、提案メール送信
