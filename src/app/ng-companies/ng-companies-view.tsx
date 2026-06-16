"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/http";

export interface NgCompanyVM {
  id: string;
  domain: string;
  name: string | null;
  note: string | null;
  createdAt: string;
}

export function NgCompaniesView({ initial }: { initial: NgCompanyVM[] }) {
  const [items, setItems] = useState<NgCompanyVM[]>(initial);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function add() {
    if (saving || !input.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const data = await fetchJson<{ item: NgCompanyVM }>("/api/ng-companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, name }),
      });
      // 既存ドメインの更新も考慮し、重複を除いて先頭に差し込む。
      setItems((cur) => [data.item, ...cur.filter((i) => i.id !== data.item.id)]);
      setInput("");
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (deleting) return;
    if (!window.confirm("このNG企業の登録を解除しますか？（以後のマッチで除外されなくなります）")) return;
    setDeleting(id);
    try {
      await fetchJson(`/api/ng-companies/${id}`, { method: "DELETE" });
      setItems((cur) => cur.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              ドメイン または メールアドレス（必須）
            </label>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="例: example.co.jp / sales@example.co.jp"
            />
          </div>
          <div className="w-56">
            <label className="mb-1 block text-xs font-medium text-slate-500">会社名（任意）</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="例: ◯◯株式会社"
            />
          </div>
          <Button onClick={add} disabled={saving || !input.trim()} variant="primary">
            {saving ? "登録中…" : "NG企業に追加"}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-muted">
          ドメインで識別します。フリーメール（gmail等）は指定できません。
        </p>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-3 text-sm font-medium text-slate-700">
          登録済み {items.length} 社
        </div>
        {items.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted">
            まだNG企業は登録されていません。
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{it.name || it.domain}</span>
                    {it.name && (
                      <span className="font-mono text-xs text-slate-500">{it.domain}</span>
                    )}
                  </div>
                  {it.note && <p className="mt-0.5 text-xs text-muted">{it.note}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  disabled={deleting === it.id}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-slate-500 ring-1 ring-border hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting === it.id ? "解除中…" : "解除"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
