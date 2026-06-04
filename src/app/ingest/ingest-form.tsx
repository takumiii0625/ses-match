"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { REMOTE_OPTIONS } from "@/lib/enums";
import { cn } from "@/lib/utils";

// ---- Sample emails -------------------------------------------------------

const SAMPLE_TALENT_EMAIL = `件名：【ご提案】Javaエンジニア（40代・フルリモート可）

お世話になっております。
以下の要員をご提案させていただきます。

氏名：田中 太郎
年齢：42歳
最寄り駅：新宿駅

【スキル】
Java / Spring Boot / AWS / Docker / PostgreSQL / Python

【主スキル】
Java（15年）、Spring Boot（8年）、AWS（5年）

【希望単価】
70〜85万

【稼働開始】
即日or7月〜

【リモート】
フルリモート希望

【備考】
大手SIerでのシステム開発経験豊富。
金融・流通・製造業の業務システム構築実績あり。
英語：日常会話レベル

以上、ご検討のほどよろしくお願いいたします。`;

const SAMPLE_PROJECT_EMAIL = `件名：【案件ご紹介】ECサイトリプレイス案件（React/TypeScript）

お世話になっております。
以下の案件をご紹介いたします。

案件名：大手ECサイト フロントエンドリプレイス
エンド：株式会社〇〇リテール（上場企業）
商流：元請け直

【必須スキル】
React / TypeScript / Next.js / AWS

【あれば歓迎】
GraphQL / Storybook / Jest

【単価】
60〜80万

【勤務地】
東京都渋谷区（ハイブリッド週2出社）

【稼働開始】
7月〜（相談可）

【概要】
レガシーなJSP製ECサイトをReact/Next.jsにリプレイスするプロジェクトです。
フロントエンドエンジニアを2名募集しています。
チーム規模：10名、期間：6ヶ月〜1年を想定。

ご興味ある方はお早めにご連絡ください。`;

// ---- Helpers ---------------------------------------------------------------

type IngestType = "talent" | "project";

interface ParsedTalentFields {
  name: string;
  age: string;
  skills: string;
  mainSkills: string;
  desiredRateMin: string;
  desiredRateMax: string;
  remotePreference: string;
  availabilityText: string;
  nearestStation: string;
  note: string;
}

interface ParsedProjectFields {
  title: string;
  clientName: string;
  requiredSkills: string;
  rateMin: string;
  rateMax: string;
  remotePreference: string;
  location: string;
  startText: string;
  description: string;
}

type ParsedFields = ParsedTalentFields | ParsedProjectFields;

function parsedToTalentFields(parsed: Record<string, unknown>): ParsedTalentFields {
  return {
    name: String(parsed.name ?? ""),
    age: parsed.age != null ? String(parsed.age) : "",
    skills: Array.isArray(parsed.skills) ? parsed.skills.join(", ") : "",
    mainSkills: Array.isArray(parsed.mainSkills) ? parsed.mainSkills.join(", ") : "",
    desiredRateMin: parsed.desiredRateMin != null ? String(parsed.desiredRateMin) : "",
    desiredRateMax: parsed.desiredRateMax != null ? String(parsed.desiredRateMax) : "",
    remotePreference: String(parsed.remotePreference ?? ""),
    availabilityText: String(parsed.availabilityText ?? ""),
    nearestStation: String(parsed.nearestStation ?? ""),
    note: String(parsed.note ?? ""),
  };
}

function parsedToProjectFields(parsed: Record<string, unknown>): ParsedProjectFields {
  return {
    title: String(parsed.title ?? ""),
    clientName: String(parsed.clientName ?? ""),
    requiredSkills: Array.isArray(parsed.requiredSkills)
      ? parsed.requiredSkills.join(", ")
      : "",
    rateMin: parsed.rateMin != null ? String(parsed.rateMin) : "",
    rateMax: parsed.rateMax != null ? String(parsed.rateMax) : "",
    remotePreference: String(parsed.remotePreference ?? ""),
    location: String(parsed.location ?? ""),
    startText: String(parsed.startText ?? ""),
    description: String(parsed.description ?? ""),
  };
}

// ---- Component -------------------------------------------------------------

export function IngestForm() {
  const [type, setType] = useState<IngestType>("talent");
  const [rawEmail, setRawEmail] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fields, setFields] = useState<ParsedFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleTypeChange(next: IngestType) {
    setType(next);
    setFields(null);
    setRawEmail("");
    setParseError(null);
    setSavedId(null);
    setSaveError(null);
  }

  function insertSample() {
    setRawEmail(type === "talent" ? SAMPLE_TALENT_EMAIL : SAMPLE_PROJECT_EMAIL);
    setFields(null);
    setParseError(null);
    setSavedId(null);
    setSaveError(null);
  }

  async function handleParse() {
    if (!rawEmail.trim()) return;
    setParsing(true);
    setParseError(null);
    setFields(null);
    setSavedId(null);
    setSaveError(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, rawEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "解析に失敗しました");
      if (type === "talent") {
        setFields(parsedToTalentFields(json.parsed));
      } else {
        setFields(parsedToProjectFields(json.parsed));
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "解析に失敗しました");
    } finally {
      setParsing(false);
    }
  }

  function updateField(key: string, value: string) {
    setFields((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function handleCreate() {
    if (!fields) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, action: "create", data: fields }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "登録に失敗しました");
      setSavedId(json.id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const remoteWithBlank = [{ value: "", label: "未設定" }, ...REMOTE_OPTIONS];

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Type toggle */}
      <Card className="p-1 flex gap-1 w-fit">
        {(["talent", "project"] as IngestType[]).map((t) => (
          <button
            key={t}
            onClick={() => handleTypeChange(t)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              type === t
                ? "bg-primary text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100"
            )}
          >
            {t === "talent" ? "人材として取り込み" : "案件として取り込み"}
          </button>
        ))}
      </Card>

      {/* Email input card */}
      <Card className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-slate-700 mb-0">
            メール本文
          </Label>
          <Button variant="outline" size="sm" onClick={insertSample} type="button">
            サンプルを挿入
          </Button>
        </div>
        <Textarea
          rows={12}
          placeholder="メール本文をここに貼り付けてください..."
          value={rawEmail}
          onChange={(e) => setRawEmail(e.target.value)}
          className="resize-y font-mono text-xs leading-relaxed"
        />
        {parseError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {parseError}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            onClick={handleParse}
            disabled={!rawEmail.trim() || parsing}
            className="min-w-28"
          >
            {parsing ? "解析中..." : "解析する"}
          </Button>
        </div>
      </Card>

      {/* Parsed result preview */}
      {fields && !savedId && (
        <Card className="p-6 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800">解析結果（編集可）</h2>
            <Badge tone="blue">AI解析済み</Badge>
          </div>

          {type === "talent" ? (
            <TalentFields
              fields={fields as ParsedTalentFields}
              onChange={updateField}
              remoteOptions={remoteWithBlank}
            />
          ) : (
            <ProjectFields
              fields={fields as ParsedProjectFields}
              onChange={updateField}
              remoteOptions={remoteWithBlank}
            />
          )}

          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {saveError}
            </p>
          )}
          <div className="flex justify-end pt-2 border-t border-border">
            <Button onClick={handleCreate} disabled={saving} className="min-w-40">
              {saving ? "登録中..." : "この内容で登録する"}
            </Button>
          </div>
        </Card>
      )}

      {/* Success state */}
      {savedId && (
        <Card className="p-6 flex flex-col items-center gap-4 text-center">
          <div className="text-3xl">✓</div>
          <p className="text-sm font-semibold text-slate-800">
            {type === "talent" ? "人材情報" : "案件情報"}を登録しました
          </p>
          <div className="flex gap-3">
            <Link href={type === "talent" ? "/in-house-talent" : "/projects"}>
              <Button variant="primary">
                {type === "talent" ? "人材一覧へ" : "案件一覧へ"}
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                setSavedId(null);
                setFields(null);
                setRawEmail("");
              }}
            >
              続けて取り込む
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---- Sub-forms -------------------------------------------------------------

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TalentFields({
  fields,
  onChange,
  remoteOptions,
}: {
  fields: ParsedTalentFields;
  onChange: (k: string, v: string) => void;
  remoteOptions: { value: string; label: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FieldRow label="氏名">
        <Input
          value={fields.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="山田 太郎"
        />
      </FieldRow>
      <FieldRow label="年齢">
        <Input
          value={fields.age}
          onChange={(e) => onChange("age", e.target.value)}
          placeholder="35"
          type="number"
        />
      </FieldRow>
      <FieldRow label="スキル（カンマ区切り）">
        <Input
          value={fields.skills}
          onChange={(e) => onChange("skills", e.target.value)}
          placeholder="Java, Spring Boot, AWS"
        />
      </FieldRow>
      <FieldRow label="主スキル（カンマ区切り）">
        <Input
          value={fields.mainSkills}
          onChange={(e) => onChange("mainSkills", e.target.value)}
          placeholder="Java, Spring Boot"
        />
      </FieldRow>
      <FieldRow label="希望単価 下限（万円）">
        <Input
          value={fields.desiredRateMin}
          onChange={(e) => onChange("desiredRateMin", e.target.value)}
          placeholder="60"
          type="number"
        />
      </FieldRow>
      <FieldRow label="希望単価 上限（万円）">
        <Input
          value={fields.desiredRateMax}
          onChange={(e) => onChange("desiredRateMax", e.target.value)}
          placeholder="80"
          type="number"
        />
      </FieldRow>
      <FieldRow label="リモート希望">
        <Select
          options={remoteOptions}
          value={fields.remotePreference}
          onChange={(e) => onChange("remotePreference", e.target.value)}
        />
      </FieldRow>
      <FieldRow label="稼働開始">
        <Input
          value={fields.availabilityText}
          onChange={(e) => onChange("availabilityText", e.target.value)}
          placeholder="即日 or 7月〜"
        />
      </FieldRow>
      <FieldRow label="最寄り駅">
        <Input
          value={fields.nearestStation}
          onChange={(e) => onChange("nearestStation", e.target.value)}
          placeholder="新宿駅"
        />
      </FieldRow>
      <div className="col-span-2">
        <FieldRow label="備考">
          <Textarea
            rows={3}
            value={fields.note}
            onChange={(e) => onChange("note", e.target.value)}
            placeholder="自由記述"
          />
        </FieldRow>
      </div>
    </div>
  );
}

function ProjectFields({
  fields,
  onChange,
  remoteOptions,
}: {
  fields: ParsedProjectFields;
  onChange: (k: string, v: string) => void;
  remoteOptions: { value: string; label: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <FieldRow label="案件名">
          <Input
            value={fields.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder="ECサイトリプレイス"
          />
        </FieldRow>
      </div>
      <FieldRow label="顧客名・エンド">
        <Input
          value={fields.clientName}
          onChange={(e) => onChange("clientName", e.target.value)}
          placeholder="株式会社〇〇"
        />
      </FieldRow>
      <FieldRow label="稼働開始">
        <Input
          value={fields.startText}
          onChange={(e) => onChange("startText", e.target.value)}
          placeholder="7月〜"
        />
      </FieldRow>
      <div className="col-span-2">
        <FieldRow label="必須スキル（カンマ区切り）">
          <Input
            value={fields.requiredSkills}
            onChange={(e) => onChange("requiredSkills", e.target.value)}
            placeholder="React, TypeScript, Node.js"
          />
        </FieldRow>
      </div>
      <FieldRow label="単価 下限（万円）">
        <Input
          value={fields.rateMin}
          onChange={(e) => onChange("rateMin", e.target.value)}
          placeholder="60"
          type="number"
        />
      </FieldRow>
      <FieldRow label="単価 上限（万円）">
        <Input
          value={fields.rateMax}
          onChange={(e) => onChange("rateMax", e.target.value)}
          placeholder="80"
          type="number"
        />
      </FieldRow>
      <FieldRow label="リモート">
        <Select
          options={remoteOptions}
          value={fields.remotePreference}
          onChange={(e) => onChange("remotePreference", e.target.value)}
        />
      </FieldRow>
      <FieldRow label="勤務地">
        <Input
          value={fields.location}
          onChange={(e) => onChange("location", e.target.value)}
          placeholder="東京都渋谷区"
        />
      </FieldRow>
      <div className="col-span-2">
        <FieldRow label="概要">
          <Textarea
            rows={4}
            value={fields.description}
            onChange={(e) => onChange("description", e.target.value)}
            placeholder="案件の詳細説明"
          />
        </FieldRow>
      </div>
    </div>
  );
}
