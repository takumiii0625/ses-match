"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/http";

// 1リクエストで処理する案件数（未判定ペアはLLM不要で即スキップ）。
const CHUNK = 12;

interface RematchPageResult {
  totalProjects: number;
  processed: number;
  done: boolean;
  talents: number;
  saved: number;
  errors: number;
  minScore: number;
}

export interface MatchJob {
  running: boolean;
  percent: number;
  label: string;
  scope: string;
  msg: string | null;
  isError: boolean;
}

export interface StartParams {
  scope: string;
  days: string;
  full: boolean;
  label: string;
}

interface Ctx {
  job: MatchJob | null;
  start: (p: StartParams) => void;
  dismiss: () => void;
}

const MatchJobContext = createContext<Ctx | null>(null);

export function useMatchJob(): Ctx {
  const c = useContext(MatchJobContext);
  if (!c) throw new Error("useMatchJob must be used within MatchJobProvider");
  return c;
}

/**
 * マッチ実行をレイアウト直下で保持する。ループをページのコンポーネントではなくここで回すため、
 * 画面を切り替えて（SPA遷移で）マッチ元ボタンがアンマウントされても、処理と進捗が消えない。
 */
export function MatchJobProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [job, setJob] = useState<MatchJob | null>(null);
  const runningRef = useRef(false);

  async function start(p: StartParams) {
    if (runningRef.current) return; // 同時に1ジョブだけ
    runningRef.current = true;
    setJob({ running: true, percent: 0, label: p.label, scope: p.scope, msg: null, isError: false });
    try {
      let offset = 0;
      let saved = 0;
      let errors = 0;
      let total = 0;
      let talents = 0;
      for (;;) {
        const data = await fetchJson<RematchPageResult>(
          `/api/cron/rematch?offset=${offset}&limit=${CHUNK}&scope=${p.scope}&days=${p.days}${p.full ? "&full=1" : ""}`,
          { method: "POST" },
        );
        total = data.totalProjects;
        talents = data.talents;
        saved += data.saved;
        errors += data.errors;
        const pct = total > 0 ? Math.round((data.processed / total) * 100) : 100;
        if (data.done) {
          setJob((j) =>
            j
              ? {
                  ...j,
                  percent: pct,
                  running: false,
                  msg:
                    `完了：${saved}件を保存（${total}案件 × ${talents}人材／${data.minScore}点以上）` +
                    (errors > 0 ? `／${errors}案件は判定失敗` : ""),
                }
              : j,
          );
          router.refresh();
          break;
        }
        setJob((j) => (j ? { ...j, percent: pct, msg: `実行中… ${data.processed}/${total}案件 ・ 保存${saved}件` } : j));
        offset = data.processed;
      }
    } catch (e) {
      setJob((j) =>
        j ? { ...j, running: false, isError: true, msg: e instanceof Error ? e.message : "マッチに失敗しました" } : j,
      );
    } finally {
      runningRef.current = false;
    }
  }

  function dismiss() {
    if (runningRef.current) return; // 実行中は消さない
    setJob(null);
  }

  return (
    <MatchJobContext.Provider value={{ job, start, dismiss }}>
      {children}
      <MatchJobToast />
    </MatchJobContext.Provider>
  );
}

/** どの画面でも右下に出るマッチ進捗トースト（実行中・完了の表示が遷移で消えない）。 */
function MatchJobToast() {
  const { job, dismiss } = useMatchJob();
  if (!job) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-white p-4 shadow-lg">
      <div className="flex items-center gap-2">
        {job.running ? (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
        ) : (
          <span className={job.isError ? "text-red-600" : "text-emerald-600"}>{job.isError ? "✕" : "✓"}</span>
        )}
        <span className="flex-1 truncate text-sm font-medium text-slate-700">{job.label}</span>
        {job.running ? (
          <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">{job.percent}%</span>
        ) : (
          <button onClick={dismiss} className="shrink-0 text-xs text-slate-400 hover:text-slate-600" aria-label="閉じる">
            ✕
          </button>
        )}
      </div>
      {job.running && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${job.percent}%` }}
          />
        </div>
      )}
      {job.msg && (
        <p className={`mt-2 text-xs ${job.isError ? "text-red-600" : "text-slate-500"}`}>{job.msg}</p>
      )}
    </div>
  );
}
