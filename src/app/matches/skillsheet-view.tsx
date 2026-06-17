"use client";

import { useEffect, useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import { extractSheetLinks } from "@/lib/sheet-links";
import { formatSkillSheetText } from "@/lib/skillsheet-format";

export interface SkillSheetData {
  summaryText: string;
  attachments: { id: string; filename: string; url: string }[];
  links: string[];
}

/** スキルシートの表示部（データ取得は呼び出し側）。何も無ければ「スキルシートなし」。 */
export function SkillSheetBody({ data }: { data: SkillSheetData }) {
  const hasText = !!data.summaryText.trim();
  const hasFiles = data.attachments.length > 0;
  const hasLinks = data.links.length > 0;
  if (!hasText && !hasFiles && !hasLinks) {
    return <p className="text-sm text-slate-400">スキルシートなし</p>;
  }
  return (
    <div className="space-y-3">
      {hasFiles && (
        <div className="flex flex-wrap gap-2">
          {data.attachments.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-primary"
            >
              <FileText className="h-3.5 w-3.5" />
              {a.filename}
            </a>
          ))}
        </div>
      )}
      {hasLinks && (
        <div className="flex flex-col gap-1.5">
          {data.links.map((u) => (
            <a
              key={u}
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 break-all text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {u}
            </a>
          ))}
        </div>
      )}
      {hasText && (
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700">
          {formatSkillSheetText(data.summaryText)}
        </div>
      )}
    </div>
  );
}

/** メール本文・備考等から、スプレッドシート等のリンクを含む SkillSheetData を組み立てる。 */
export function toSkillSheetData(t: {
  summaryText?: unknown;
  attachments?: unknown;
  emailBody?: string | null;
  note?: string | null;
}): SkillSheetData {
  return {
    summaryText: typeof t.summaryText === "string" ? t.summaryText : "",
    attachments: Array.isArray(t.attachments) ? t.attachments : [],
    links: extractSheetLinks(t.emailBody, t.note, typeof t.summaryText === "string" ? t.summaryText : ""),
  };
}

/** マッチ詳細でその人材のスキルシートを表示する。
 *  - 添付（PDF等）→ ファイルリンク＋抽出テキスト（summaryText）
 *  - スプレッドシート等のリンク → そのリンクを表示
 *  - 何も無ければ「スキルシートなし」 */
export function SkillSheetView({ talentId }: { talentId: string }) {
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [data, setData] = useState<SkillSheetData | null>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    setData(null);
    fetch(`/api/talents/${talentId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((t) => {
        if (!active) return;
        setData(toSkillSheetData(t));
        setState("done");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [talentId]);

  if (state === "loading") {
    return <p className="text-sm text-slate-500">スキルシートを読み込み中…</p>;
  }
  if (state === "error" || !data) {
    return <p className="text-sm text-red-600">スキルシートの取得に失敗しました</p>;
  }
  return <SkillSheetBody data={data} />;
}
