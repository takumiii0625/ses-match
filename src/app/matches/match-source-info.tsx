"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { ChevronDown } from "lucide-react";
import { SkillSheetBody, toSkillSheetData, type SkillSheetData } from "./skillsheet-view";

interface TalentSrc {
  summaryText?: string | null;
  attachments?: { id: string; filename: string; url: string }[];
  emailBody?: string | null;
  note?: string | null;
}
interface ProjectSrc {
  emailBody?: string | null;
  description?: string | null;
}

/** 開閉できる本文セクション（ネイティブ details＝画面遷移なしで開く）。 */
function Disclosure({ title, text }: { title: string; text: string | null | undefined }) {
  const has = !!text && text.trim().length > 0;
  return (
    <details className="group rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span>
          {title}
          {!has && <span className="ml-1 text-slate-300">（なし）</span>}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-3 py-2">
        {has ? (
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-700">
            {text}
          </div>
        ) : (
          <p className="text-xs text-slate-400">記載なし</p>
        )}
      </div>
    </details>
  );
}

/**
 * マッチ詳細の「元情報」: 人材のスキルシート＋（開閉で）人材のメール本文/概要。
 * showProject=true のときは案件のメール本文/概要も右に表示する（案件起点では左ヘッダーに出すため false）。
 * 選択時に人材（必要なら案件）を取得（画面遷移なし）。既存のスキルシート表示はそのまま再利用。
 */
export function MatchSourceInfo({
  talentId,
  projectId,
  showProject = true,
}: {
  talentId: string;
  projectId: string;
  showProject?: boolean;
}) {
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [talent, setTalent] = useState<TalentSrc | null>(null);
  const [project, setProject] = useState<ProjectSrc | null>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    setTalent(null);
    setProject(null);
    Promise.all([
      fetch(`/api/talents/${talentId}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error()))),
      showProject
        ? fetch(`/api/projects/${projectId}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
        : Promise.resolve(null),
    ])
      .then(([t, p]) => {
        if (!active) return;
        setTalent(t as TalentSrc);
        setProject((p as ProjectSrc) ?? null);
        setState("done");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [talentId, projectId, showProject]);

  if (state === "loading") {
    return <p className="text-sm text-slate-500">読み込み中…</p>;
  }
  if (state === "error" || !talent) {
    return <p className="text-sm text-red-600">元情報の取得に失敗しました</p>;
  }

  const sheet: SkillSheetData = toSkillSheetData(talent);

  return (
    <div className="space-y-3">
      {/* スキルシート（従来どおりインライン表示） */}
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-500">スキルシート</div>
        <SkillSheetBody data={sheet} />
      </div>

      {/* 元メール（開閉） */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-slate-500">元メール</div>
        {showProject && project && <Disclosure title="案件メール本文" text={project.emailBody} />}
        <Disclosure title="人材メール本文" text={talent.emailBody} />
      </div>
    </div>
  );
}

/**
 * 案件ヘッダー（左ペイン）に置く、案件の元メール・概要の遅延ディスクロージャ。
 * 開いた時だけ案件を取得する（一覧の案件数だけ無駄に取得しない）。
 */
export function ProjectSourceDisclosure({ projectId }: { projectId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<ProjectSrc | null>(null);
  const [error, setError] = useState(false);

  function onToggle(e: SyntheticEvent<HTMLDetailsElement>) {
    if (!e.currentTarget.open || loaded) return;
    setLoaded(true);
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((p) => setData(p as ProjectSrc))
      .catch(() => setError(true));
  }

  return (
    <details className="group mt-2" onToggle={onToggle}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-500 hover:text-primary [&::-webkit-details-marker]:hidden">
        案件メール本文
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-1.5">
        {error ? (
          <p className="text-xs text-red-600">取得に失敗しました</p>
        ) : !data ? (
          <p className="text-xs text-slate-400">読み込み中…</p>
        ) : data.emailBody && data.emailBody.trim() ? (
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700">
            {data.emailBody}
          </div>
        ) : (
          <p className="text-xs text-slate-400">記載なし</p>
        )}
      </div>
    </details>
  );
}
