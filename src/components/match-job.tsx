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

// 1リクエストで処理する案件数。小さいほど1リクエストが短く＝300秒の関数上限や接続断に強い。
const CHUNK = 6;
// 同一地点で連続失敗したら、それ以上は進めずに打ち切る回数。
const MAX_CONSEC_FAILS = 3;

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
    let offset = 0;
    let saved = 0;
    let errors = 0;
    let total = 0;
    let talents = 0;
    let minScore = 0;
    let consecFails = 0;
    try {
      // 1チャンクずつ完了まで。1チャンクが失敗(300秒超過/接続断)しても全体は止めず、
      // 数回までスキップして継続する（残りは次回・再実行で続きから拾える）。
      for (let i = 0; i < 100000; i++) {
        let data: RematchPageResult | null = null;
        try {
          data = await fetchJson<RematchPageResult>(
            `/api/cron/rematch?offset=${offset}&limit=${CHUNK}&scope=${p.scope}&days=${p.days}${p.full ? "&full=1" : ""}`,
            { method: "POST" },
          );
          consecFails = 0;
        } catch {
          consecFails++;
          errors++;
          // まだ総数すら取れていない（最初から失敗）→ これ以上進めないので打ち切り。
          if (total === 0 && consecFails >= MAX_CONSEC_FAILS) {
            setJob((j) =>
              j
                ? { ...j, running: false, isError: true, msg: "マッチの実行に失敗しました（件数を絞って再実行してください）" }
                : j,
            );
            break;
          }
          if (consecFails >= MAX_CONSEC_FAILS) {
            // 連続失敗は打ち切り（ここまでの分は保存済み）。
            setJob((j) =>
              j
                ? { ...j, running: false, msg: `途中まで保存（${saved}件）。重い箇所でエラーが続いたため打ち切りました。再実行すると続きから処理します。` }
                : j,
            );
            router.refresh();
            break;
          }
          // この地点をスキップして次のチャンクへ（遅い案件が1つでも全体を止めない）。
          offset += CHUNK;
          if (total > 0 && offset >= total) {
            setJob((j) =>
              j
                ? { ...j, running: false, msg: `完了：${saved}件を保存（一部${errors}件はスキップ）。` }
                : j,
            );
            router.refresh();
            break;
          }
          setJob((j) => (j ? { ...j, msg: `一部でエラー。スキップして継続中…（保存${saved}件）` } : j));
          continue;
        }

        total = data.totalProjects;
        talents = data.talents;
        minScore = data.minScore;
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
                    `完了：${saved}件を保存（${total}案件 × ${talents}人材／${minScore}点以上）` +
                    (errors > 0 ? `／${errors}件は失敗/スキップ` : ""),
                }
              : j,
          );
          router.refresh();
          break;
        }
        setJob((j) => (j ? { ...j, percent: pct, msg: `実行中… ${data.processed}/${total}案件 ・ 保存${saved}件` } : j));
        // processed が進まない（同じ値）場合も前進させてループ停滞を防ぐ。
        offset = data.processed > offset ? data.processed : offset + CHUNK;
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
