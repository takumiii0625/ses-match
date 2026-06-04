"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PROJECT_STATUS_OPTIONS,
  REMOTE_OPTIONS,
  DATA_SOURCE_LABELS,
  toOptions,
} from "@/lib/enums";
import type { Project, User } from "@prisma/client";

const DATA_SOURCE_OPTIONS = toOptions(DATA_SOURCE_LABELS);

interface Props {
  users: User[];
  initial?: Partial<Project>;
  mode: "create" | "edit";
}

function splitComma(v: string): string[] {
  return v
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ProjectForm({ users, initial, mode }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  const [form, setForm] = useState({
    title: initial?.title ?? "",
    managementId: initial?.managementId ?? "",
    clientName: initial?.clientName ?? "",
    businessFlow: initial?.businessFlow ?? "",
    status: initial?.status ?? "OPEN",
    dataFrom: initial?.dataFrom ?? "REGISTER",
    assigneeId: initial?.assigneeId ?? "",
    description: initial?.description ?? "",
    requiredSkills: (initial?.requiredSkills ?? []).join(", "),
    tags: (initial?.tags ?? []).join(", "),
    rateMin: initial?.rateMin != null ? String(initial.rateMin) : "",
    rateMax: initial?.rateMax != null ? String(initial.rateMax) : "",
    remotePreference: initial?.remotePreference ?? "",
    location: initial?.location ?? "",
    nearestStation: initial?.nearestStation ?? "",
    startText: initial?.startText ?? "",
  });

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body = {
      title: form.title,
      managementId: form.managementId || null,
      clientName: form.clientName || null,
      businessFlow: form.businessFlow || null,
      status: form.status,
      dataFrom: form.dataFrom,
      assigneeId: form.assigneeId || null,
      description: form.description || null,
      requiredSkills: splitComma(form.requiredSkills),
      tags: splitComma(form.tags),
      rateMin: form.rateMin !== "" ? Number(form.rateMin) : null,
      rateMax: form.rateMax !== "" ? Number(form.rateMax) : null,
      remotePreference: form.remotePreference || null,
      location: form.location || null,
      nearestStation: form.nearestStation || null,
      startText: form.startText || null,
    };

    try {
      const url =
        mode === "edit" ? `/api/projects/${initial?.id}` : "/api/projects";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      router.push("/projects");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Row 1: 案件名 + 管理ID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="title">案件名 *</Label>
            <Input
              id="title"
              required
              value={form.title}
              onChange={set("title")}
              placeholder="例: Java/Spring案件"
            />
          </div>
          <div>
            <Label htmlFor="managementId">管理ID</Label>
            <Input
              id="managementId"
              value={form.managementId}
              onChange={set("managementId")}
              placeholder="例: P-001"
            />
          </div>
        </div>

        {/* Row 2: クライアント + 商流 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="clientName">エンド/商流元</Label>
            <Input
              id="clientName"
              value={form.clientName}
              onChange={set("clientName")}
              placeholder="例: ○○株式会社"
            />
          </div>
          <div>
            <Label htmlFor="businessFlow">商流</Label>
            <Input
              id="businessFlow"
              value={form.businessFlow}
              onChange={set("businessFlow")}
              placeholder="例: 直案件 / 1社挟む"
            />
          </div>
        </div>

        {/* Row 3: ステータス + データ元 + 担当者 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="status">ステータス</Label>
            <Select
              id="status"
              options={PROJECT_STATUS_OPTIONS}
              value={form.status}
              onChange={set("status")}
            />
          </div>
          <div>
            <Label htmlFor="dataFrom">データ元</Label>
            <Select
              id="dataFrom"
              options={DATA_SOURCE_OPTIONS}
              value={form.dataFrom}
              onChange={set("dataFrom")}
            />
          </div>
          <div>
            <Label htmlFor="assigneeId">担当者</Label>
            <Select
              id="assigneeId"
              options={userOptions}
              placeholder="未設定"
              value={form.assigneeId}
              onChange={set("assigneeId")}
            />
          </div>
        </div>

        {/* Row 4: 案件概要 */}
        <div>
          <Label htmlFor="description">案件概要</Label>
          <Textarea
            id="description"
            rows={4}
            value={form.description}
            onChange={set("description")}
            placeholder="案件の詳細内容..."
          />
        </div>

        {/* Row 5: 必須スキル + タグ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="requiredSkills">必須スキル（カンマ区切り）</Label>
            <Input
              id="requiredSkills"
              value={form.requiredSkills}
              onChange={set("requiredSkills")}
              placeholder="例: Java, Spring, AWS"
            />
          </div>
          <div>
            <Label htmlFor="tags">タグ（カンマ区切り）</Label>
            <Input
              id="tags"
              value={form.tags}
              onChange={set("tags")}
              placeholder="例: 金融, 大手企業"
            />
          </div>
        </div>

        {/* Row 6: 単価 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="rateMin">単価下限（万円）</Label>
            <Input
              id="rateMin"
              type="number"
              min={0}
              value={form.rateMin}
              onChange={set("rateMin")}
              placeholder="例: 60"
            />
          </div>
          <div>
            <Label htmlFor="rateMax">単価上限（万円）</Label>
            <Input
              id="rateMax"
              type="number"
              min={0}
              value={form.rateMax}
              onChange={set("rateMax")}
              placeholder="例: 80"
            />
          </div>
        </div>

        {/* Row 7: リモート + 勤務地 + 最寄り駅 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="remotePreference">リモート勤務</Label>
            <Select
              id="remotePreference"
              options={REMOTE_OPTIONS}
              placeholder="未設定"
              value={form.remotePreference}
              onChange={set("remotePreference")}
            />
          </div>
          <div>
            <Label htmlFor="location">勤務地</Label>
            <Input
              id="location"
              value={form.location}
              onChange={set("location")}
              placeholder="例: 東京都千代田区"
            />
          </div>
          <div>
            <Label htmlFor="nearestStation">最寄り駅</Label>
            <Input
              id="nearestStation"
              value={form.nearestStation}
              onChange={set("nearestStation")}
              placeholder="例: 大手町駅"
            />
          </div>
        </div>

        {/* Row 8: 開始時期 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="startText">開始時期（テキスト）</Label>
            <Input
              id="startText"
              value={form.startText}
              onChange={set("startText")}
              placeholder="例: 即日〜2024年7月"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? "保存中..." : mode === "create" ? "登録する" : "更新する"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={saving}
          >
            キャンセル
          </Button>
        </div>
      </form>
    </Card>
  );
}
