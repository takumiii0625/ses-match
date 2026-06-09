# AIプロンプト仕様

このアプリでLLM（Claude、既定は `claude-haiku-4-5`）に渡しているプロンプトの一覧です。
実装は `src/lib/ai/anthropic.ts`（分類・抽出・提案生成）と `src/lib/matching.ts`（スコアリング）。

> 補足：**マッチングの「スコア計算」自体はLLMを使いません**（決定論的な関数）。
> LLMを使うのは「メール分類」「情報抽出」「提案文生成」の3つです。

---

## 1. メール分類プロンプト（人材／案件／対象外）



`AnthropicAIService.classifyEmail()` で使用。受信メールを 3 区分に振り分けます。
**構造化出力（JSON Schema）** で `kind` と `reason` を強制します。

### システムプロンプト

```text
あなたはSES業界のメールを仕分けるアシスタントです。
メール本文（と添付）が次のどれかを判定してください:
- TALENT: 稼働可能なエンジニア（人材）の紹介・売り込み。経歴書/スキルシートの提示など。
- PROJECT: 案件・求人の募集。必要スキル・単価・勤務地などの提示。
- IGNORE: 上記以外（営業案内、問い合わせ、自動返信、無関係なメールなど）。
判定理由を日本語で簡潔に述べてください。確信が持てない場合はIGNOREにする。
```

### ユーザー入力
メール本文（`件名 / 差出人 / 本文`）＋ 添付PDF（`document` ブロック）。

### 出力スキーマ（JSON Schema / strict）

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "kind":   { "type": "string", "enum": ["TALENT", "PROJECT", "IGNORE"] },
    "reason": { "type": "string" }
  },
  "required": ["kind", "reason"]
}
```

---

## 2. マッチング（スコアリング）— 決定論ロジック（事前フィルタ＆スコア計算モード）

> ℹ️ 保存されるマッチ（取込後の自動マッチ・全件マッチ）は **§5 のLLM判定** を使用します。
> 本節の `scoreMatch()` は (a) マッチング画面の「スコア計算」モード、(b) LLM障害時のフォールバック、
> として残っています。`prefilterCandidates()`（必須スキルによる事前絞り込み）もここに同居します。

`scoreMatch(talent, project)` が人材×案件の適合度を **0〜100点** で算出します。
LLMは使わず、以下の重み付けで計算します（`src/lib/matching.ts`）。

| 観点 | 配点 | 判定ロジック |
|------|-----:|--------------|
| **スキル** | 60 | 案件の必須スキルのうち、人材が保有する割合 ×60。必須スキル未指定なら一律30。 |
| **単価** | 20 | 人材の希望下限 ≤ 案件の上限単価 なら +20。両方未指定なら +10。 |
| **リモート** | 10 | 人材の出社許容度 ≥ 案件の要求度 なら +10。片方未指定なら +5。 |
| **稼働開始** | 10 | 稼働開始時期の情報があれば +10。 |

- リモートのランク：`FULL_REMOTE(0) < MOSTLY_REMOTE(1) < HYBRID(2) < OFFICE_1..4(3-6) < ONSITE(7)`
  （数値が大きいほど出社可能 ＝ より柔軟）
- 算出時に「マッチング根拠（reasons）」も生成し、提案文に流用します。例：
  - `必須スキル 3 件中 3 件一致（100%）`
  - `単価適合（希望85万 ≤ 上限120万）`
  - `リモート条件が合致`

> この `reasons` が、次の「提案文生成」プロンプトに **マッチング根拠** として渡されます。

---

## 3. 提案文生成プロンプト（マッチ結果 → 提案メール）

`AnthropicAIService.generateProposal()` で使用。
マッチング結果（人材・案件・スコア根拠）をもとに、日本語の提案メール本文を生成します。

### システムプロンプト

```text
あなたはSES営業の提案メールを作成するアシスタントです。
提示された案件と人材の情報をもとに、丁寧で簡潔な日本語の提案メール本文を作成してください。

要件:
- 宛先の挨拶 → 案件名への言及 → 提案要員（イニシャル/スキル/単価）→ マッチング根拠 → 結びの依頼、の構成。
- ビジネスメールとして自然な敬語。誇張や事実の捏造はしない。提示された情報のみ使用する。
- 本文のみを出力し、件名やコードブロックは含めない。
```

### ユーザー入力（テンプレート）

```text
以下の情報をもとに提案メール本文を作成してください。

案件名: {案件タイトル}
エンド/商流元: {クライアント名}        # 任意
提案人材（イニシャル）: {人材名}
スキル: {スキル1 / スキル2 / ...}
希望単価: {例: 85万〜}                  # 任意
マッチング根拠:
- 必須スキル 3 件中 3 件一致（100%）
- 単価適合（希望85万 ≤ 上限120万）
```

> 「マッチング根拠」は §2 の `scoreMatch()` が出した `reasons` をそのまま使用します。

---

## （参考）4. 情報抽出プロンプト

分類で TALENT / PROJECT と判定された後、構造化抽出に使うプロンプトです。

### 人材抽出（`parseTalentEmail`）

```text
あなたはSES業界の人材情報を扱うアシスタントです。
与えられたメール本文から、稼働可能なエンジニア（人材）の情報を抽出し、指定されたJSONスキーマに従って構造化してください。

ルール:
- 単価（desiredRateMin/Max）は月額・万円単位の整数。「80万」→80、「60〜80万」→min60/max80。記載がなければnull。
- remotePreference はメール記載に最も近いenum値を1つ選ぶ。判断できなければnull。
  FULL_REMOTE=フルリモート, MOSTLY_REMOTE=基本リモート, HYBRID=ハイブリッド,
  OFFICE_1〜4=週1〜4回出社可, ONSITE=常駐可
- skills は本文中の技術キーワード（言語/FW/クラウド/DB等）。mainSkills はそのうち主要な最大3件。
- availabilityText は稼働開始時期の原文（例「即日or6月〜」）。
- nearestStation は最寄り駅名のみ。
- note は人材の特徴を日本語で1〜2文に要約。
- 推測で値を捏造しない。不明な項目はnull、配列は空配列にする。
```

### 案件抽出（`parseProjectEmail`）

```text
あなたはSES業界の案件情報を扱うアシスタントです。
与えられたメール本文から、SES案件の情報を抽出し、指定されたJSONスキーマに従って構造化してください。

ルール:
- title は案件名/件名。clientName はエンド企業名や商流元。
- requiredSkills は必須・歓迎スキル（技術キーワード）。
- 単価（rateMin/Max）は月額・万円単位の整数。記載がなければnull。
- remotePreference はメール記載に最も近いenum値を1つ選ぶ。判断できなければnull。
  FULL_REMOTE=フルリモート, MOSTLY_REMOTE=基本リモート, HYBRID=ハイブリッド,
  OFFICE_1〜4=週1〜4回出社可, ONSITE=常駐可
- location は勤務地。startText は開始時期の原文。
- description は案件概要を日本語で1〜3文に要約。
- 推測で値を捏造しない。不明な項目はnull、配列は空配列にする。
```

---

## 5. LLMマッチング判定プロンプト（実装済み・設定画面で編集可）

> ✅ **実装済み**。方式は **一括ランキング**（1案件＋候補人材リストをまとめて判定）。
> プロンプトのデフォルトは `src/lib/ai/prompts.ts`（`DEFAULT_MATCH_PROMPT`）に定義。
> **設定画面 →「マッチ判定プロンプト」から表示・編集・デフォルト復帰**ができ、
> 組織ごとに `Organization.matchPrompt` として保存される（未設定ならデフォルトを使用）。
> このプロンプトは「取込後の自動マッチ」「全件マッチ（手動/クロン）」「マッチング画面のAI判定」で共通利用される。
> 2段ファネル（事前フィルタ＋LLM再ランキング）は `src/lib/match-run.ts` と
> `prefilterCandidates()`（`src/lib/matching.ts`）に実装。下記は現行のデフォルト文面。

### システムプロンプト（草案）

```text
あなたはSES業界の人材マッチングを判定するエキスパートです。
1つの案件と複数の候補人材が与えられます。各候補について案件への適合度を多面的に評価し、
0〜100点のスコア・推奨度・根拠を返してください。

評価観点（重要度の高い順）:
1. 必須スキルの充足（最重要）。歓迎スキルは加点要素。
2. 単価の整合（人材の希望が案件の予算内か）。
3. 稼働開始時期の整合。
4. リモート/出社条件の整合。
5. 経験年数・担当役割・語学など、案件要件との整合。

推奨度 (recommendation):
- STRONG  : 必須スキルを満たし単価・稼働も整合。すぐ提案すべき最有力。
- POSSIBLE: 一部条件に懸念はあるが提案検討の価値あり。
- WEAK    : 大きなミスマッチがあり提案は限定的。
- UNFIT   : 案件と無関係／不適合。

ルール:
- 提示された情報のみで判断し、推測で事実を作らない。不足情報は懸念(concerns)に「不明」として挙げる。
- スコアは観点を総合した「実務的な提案優先度」を表す（単なるスキル一致率ではない）。
- 各候補について strengths（合致点）と concerns（懸念点）を簡潔な日本語で挙げる。
- 候補は talentId で識別し、入力された全候補を漏れなく評価する。

【重要】大分類だけでの適合を禁止する:
- 「開発」「エンジニア」「インフラ」等の大きなカテゴリ／タグが一致しているだけでは適合とみなさない。
  案件が要求する具体的な言語・FW・技術スタックを、人材が実際に保有または代替可能かで判断する。
- 例: 案件が「PHP/Laravel」なのに人材が「Javaのみ」なら、同じ"開発"でも UNFIT（または大きく減点）とする。
- 技術の包含関係は考慮してよい。例: Spring/Spring Boot は Java を、Next.js は React/JavaScript を前提とみなす。
  ただし無関係な言語（Java↔PHP、Go↔Ruby 等）を「同じ開発職だから」で適合扱いにしない。
```

### ユーザー入力（テンプレート）

```text
# 案件
タイトル: {title}
クライアント/商流: {clientName}
必須スキル: {requiredSkills}
想定単価: {rateMin}〜{rateMax}万
リモート: {remotePreference}
勤務地/最寄り: {location}
開始時期: {startText}
概要: {description}

# 候補人材（複数）
- talentId: {id}
  氏名: {name} / 年齢: {age} / 区分: {自社 or 他社}
  スキル: {skills}
  希望単価: {desiredRateMin}〜{desiredRateMax}万
  リモート希望: {remotePreference}
  稼働開始: {availabilityText}
  最寄り: {nearestStation}
  メモ: {note}
- talentId: ...
```

### 出力スキーマ（JSON Schema / strict・草案）

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "talentId":       { "type": "string" },
          "score":          { "type": "integer" },
          "recommendation": { "type": "string", "enum": ["STRONG","POSSIBLE","WEAK","UNFIT"] },
          "strengths":      { "type": "array", "items": { "type": "string" } },
          "concerns":       { "type": "array", "items": { "type": "string" } },
          "reason":         { "type": "string" }
        },
        "required": ["talentId","score","recommendation","strengths","concerns","reason"]
      }
    }
  },
  "required": ["results"]
}
```

### 実装メモ（確定後に私が組み込み）— 2段階ファネル
**① 事前フィルタ（関数・LLM不使用・スケール担当）**
- **タグでは絞らない**。案件の必須スキル(requiredSkills)を、人材の skills/mainSkills と
  正規化＋同義語展開して突き合わせる（Java↔Spring/Spring Boot、React↔Next.js、AWS系 等）。
- 必須スキルの中核カバー率がしきい値未満の候補は除外（例: 中核1件以上 or カバー率50%以上）。
  → 「言語違いでも開発タグで一致」を構造的に排除。
- 単価上限超過・稼働時期が大きくズレる候補も除外。
- 残った候補を上位N件（例: 30件）に圧縮してLLMへ。

**② LLM再ランキング（少数のみ・精度担当）**
- `AIService.rankCandidates(project, shortlist[])` を追加（anthropic / mock / types）。
- 上記プロンプトで各候補を score / recommendation / strengths / concerns / reason 付き評価。
- 大分類だけの適合を禁止（無関係言語の誤マッチを最終的に潰す）。

**画面・運用**
- マッチング画面に「AI判定」モードを追加（従来の関数スコアは切替で残す）。
- 結果（スコア・合致点・懸念点）を表示。提案文生成にも reason を流用。
- 同義語辞書は `src/lib/matching.ts` 等に定義し、運用で追記できるようにする。

---

## モデル・実装メモ

- モデル: **`claude-opus-4-8`**（精度最優先の既定。環境変数 `ANTHROPIC_MODEL` で `claude-sonnet-4-6` / `claude-haiku-4-5` 等に変更可）
- 抽出・分類は **構造化出力**（`output_config.format` の `json_schema`）で型安全に取得
- システムプロンプトには **プロンプトキャッシュ**（`cache_control: ephemeral`）を付与
- `AI_PROVIDER` 未設定時は **モック実装**（`src/lib/ai/mock.ts`）にフォールバック
