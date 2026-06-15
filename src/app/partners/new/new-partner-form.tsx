"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { fetchJson } from "@/lib/http";

export function NewPartnerForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", industry: "", phone: "", website: "", note: "", tags: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const company = await fetchJson<{ id: string }>("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      // メールが入力されていれば最初の連絡先も作る
      if (form.email.trim()) {
        await fetchJson(`/api/partners/${company.id}/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email }),
        }).catch(() => {});
      }
      router.push(`/partners/${company.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Card className="p-6">
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>会社名 *</Label>
          <Input value={form.name} onChange={set("name")} placeholder="株式会社○○" />
        </div>
        <div>
          <Label>連絡先メール（任意）</Label>
          <Input value={form.email} onChange={set("email")} placeholder="sales@example.co.jp" />
        </div>
        <div>
          <Label>業種</Label>
          <Input value={form.industry} onChange={set("industry")} />
        </div>
        <div>
          <Label>電話</Label>
          <Input value={form.phone} onChange={set("phone")} />
        </div>
        <div>
          <Label>Webサイト</Label>
          <Input value={form.website} onChange={set("website")} />
        </div>
        <div>
          <Label>タグ（カンマ区切り）</Label>
          <Input value={form.tags} onChange={set("tags")} placeholder="SAP, Web系" />
        </div>
        <div className="sm:col-span-2">
          <Label>メモ</Label>
          <Textarea rows={3} value={form.note} onChange={set("note")} />
        </div>
      </div>
      <div className="mt-4">
        <Button onClick={save} disabled={saving || !form.name.trim()}>
          {saving ? "保存中…" : "登録"}
        </Button>
      </div>
    </Card>
  );
}
