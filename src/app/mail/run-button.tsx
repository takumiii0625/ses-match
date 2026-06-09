"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { fetchJson } from "@/lib/http";

interface IngestPageResult {
  fetched: number;
  created: { talent: number; project: number };
  ignored: number;
  skipped: number;
  errors: number;
  matched?: { saved: number };
  nextPageToken: string | null;
  done: boolean;
}

// 1ページで処理するメール数。小さいほど各リクエストが短く＝タイムアウトしない。
const PAGE_SIZE = 10;
// 暴走防止の上限ページ数。
const MAX_PAGES = 500;

export function RunButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function run() {
    if (loading) return;
    setLoading(true);
    setMsg(null);
    setIsError(false);
    try {
      let pageToken: string | null = null;
      let talent = 0;
      let project = 0;
      let ignored = 0;
      let skipped = 0;
      let errors = 0;
      let matched = 0;
      let processed = 0;

      for (let i = 0; i < MAX_PAGES; i++) {
        const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
        if (pageToken) qs.set("pageToken", pageToken);
        const data: IngestPageResult = await fetchJson<IngestPageResult>(
          `/api/cron/fetch-mail?${qs.toString()}`,
          { method: "POST" },
        );
        talent += data.created.talent;
        project += data.created.project;
        ignored += data.ignored;
        skipped += data.skipped;
        errors += data.errors;
        matched += data.matched?.saved ?? 0;
        processed += data.fetched;

        setMsg(
          `取り込み中… ${processed}件処理 ・ 人材${talent} / 案件${project} / マッチ${matched}`,
        );

        if (data.done) break;
        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }

      setMsg(
        `完了：人材${talent} / 案件${project} / 対象外${ignored} / 重複${skipped} / エラー${errors} / マッチ${matched}`,
      );
      router.refresh();
    } catch (e) {
      setIsError(true);
      setMsg(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={disabled || loading}>
        <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {loading ? "取り込み中…" : "今すぐ取り込み"}
      </Button>
      {msg && (
        <span className={`text-sm ${isError ? "text-red-600" : "text-slate-600"}`}>
          {msg}
        </span>
      )}
    </div>
  );
}
