"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SharedLinkType = "TALENT" | "PROJECT" | "TALENT_LIST";

interface SharedLink {
  id: string;
  token: string;
  type: SharedLinkType;
  targetId: string | null;
  label: string | null;
  createdAt: string;
  targetName?: string | null;
}

interface Props {
  links: SharedLink[];
}

const TYPE_LABELS: Record<SharedLinkType, string> = {
  TALENT: "人材",
  PROJECT: "案件",
  TALENT_LIST: "人材一覧",
};

const TYPE_TONES = {
  TALENT: "blue",
  PROJECT: "green",
  TALENT_LIST: "indigo",
} as const;

export function LinksTable({ links }: Props) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("このリンクを削除しますか？")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/shared-links/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(
        window.location.origin + `/share/${token}`,
      );
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // fallback
    }
  }

  if (links.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        公開リンクはまだありません。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-slate-500">
            <th className="pb-3 pr-4">ラベル</th>
            <th className="pb-3 pr-4">種別</th>
            <th className="pb-3 pr-4">対象</th>
            <th className="pb-3 pr-4">リンクURL</th>
            <th className="pb-3 pr-4">作成日</th>
            <th className="pb-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {links.map((link) => {
            const path = `/share/${link.token}`;
            return (
              <tr key={link.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-3 pr-4 text-slate-700 max-w-[160px] truncate">
                  {link.label ?? <span className="text-slate-400">-</span>}
                </td>
                <td className="py-3 pr-4">
                  <Badge tone={TYPE_TONES[link.type]}>
                    {TYPE_LABELS[link.type]}
                  </Badge>
                </td>
                <td className="py-3 pr-4 text-slate-600 max-w-[180px] truncate">
                  {link.targetName ?? (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-600 truncate max-w-[200px]">
                      {path}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(link.token)}
                    >
                      {copiedToken === link.token ? "コピー済み" : "コピー"}
                    </Button>
                  </div>
                </td>
                <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">
                  {new Date(link.createdAt).toLocaleDateString("ja-JP")}
                </td>
                <td className="py-3">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={deletingId === link.id}
                    onClick={() => handleDelete(link.id)}
                  >
                    {deletingId === link.id ? "削除中..." : "削除"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
