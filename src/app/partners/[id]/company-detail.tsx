"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { fetchJson } from "@/lib/http";

export interface CompanyVM {
  id: string;
  name: string;
  industry: string | null;
  phone: string | null;
  website: string | null;
  note: string | null;
  domain: string | null;
  tags: string[];
  createdAt: string;
}
export interface ContactVM {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  status: string; // ACTIVE | BOUNCED | UNSUBSCRIBED
}

const STATUS_BADGE: Record<string, { label: string; tone: "green" | "amber" | "slate" }> = {
  ACTIVE: { label: "配信中", tone: "green" },
  BOUNCED: { label: "不達", tone: "amber" },
  UNSUBSCRIBED: { label: "停止", tone: "slate" },
};

export function CompanyDetail({ company, contacts }: { company: CompanyVM; contacts: ContactVM[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: company.name,
    industry: company.industry ?? "",
    phone: company.phone ?? "",
    website: company.website ?? "",
    note: company.note ?? "",
    tags: company.tags.join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 連絡先追加フォーム
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function saveCompany() {
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/partners/${company.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function addContact() {
    if (!newEmail.trim() || adding) return;
    setAdding(true);
    setErr(null);
    try {
      await fetchJson(`/api/partners/${company.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, name: newName }),
      });
      setNewEmail("");
      setNewName("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setAdding(false);
    }
  }

  async function toggleStatus(c: ContactVM) {
    const next = c.status === "ACTIVE" ? "UNSUBSCRIBED" : "ACTIVE";
    try {
      await fetchJson(`/api/partner-contacts/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "変更に失敗しました");
    }
  }

  async function deleteContact(c: ContactVM) {
    if (!window.confirm(`${c.email} を削除しますか？`)) return;
    try {
      await fetchJson(`/api/partner-contacts/${c.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "削除に失敗しました");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      {/* 会社情報 */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-700">会社情報</h2>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              編集
            </Button>
          )}
        </div>
        {editing ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>会社名</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>業種</Label>
              <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </div>
            <div>
              <Label>電話</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Webサイト</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>タグ（カンマ区切り）</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>メモ</Label>
              <Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button onClick={saveCompany} disabled={saving || !form.name.trim()}>
                {saving ? "保存中…" : "保存"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                キャンセル
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="業種" value={company.industry} />
            <Row label="電話" value={company.phone} />
            <Row label="Webサイト" value={company.website} />
            <Row label="ドメイン" value={company.domain} />
            <Row label="タグ" value={company.tags.join("、") || null} />
            <Row
              label="登録日"
              value={new Date(company.createdAt).toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                timeZone: "Asia/Tokyo",
              })}
            />
            <Row label="メモ" value={company.note} wide />
          </dl>
        )}
      </Card>

      {/* 連絡先 */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-700">連絡先（{contacts.length}）</h2>
        <div className="flex flex-col divide-y divide-border">
          {contacts.map((c) => {
            const b = STATUS_BADGE[c.status] ?? STATUS_BADGE.ACTIVE;
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <Badge tone={b.tone}>{b.label}</Badge>
                <span className="min-w-0 flex-1 break-all text-sm text-slate-700">
                  {c.email}
                  {c.name && <span className="ml-2 text-xs text-muted">{c.name}</span>}
                </span>
                <button
                  onClick={() => toggleStatus(c)}
                  className="rounded border border-border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {c.status === "ACTIVE" ? "配信停止にする" : "配信中に戻す"}
                </button>
                <button
                  onClick={() => deleteContact(c)}
                  className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            );
          })}
          {contacts.length === 0 && <p className="py-3 text-sm text-muted">連絡先がありません。</p>}
        </div>

        {/* 追加 */}
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div className="min-w-[200px] flex-1">
            <Label>メールを追加</Label>
            <Input placeholder="contact@example.co.jp" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <div className="w-40">
            <Label>担当者名（任意）</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <Button onClick={addContact} disabled={adding || !newEmail.trim()}>
            {adding ? "追加中…" : "追加"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-slate-700 break-words whitespace-pre-wrap">{value || "—"}</dd>
    </div>
  );
}
