"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";

interface Project {
  id: string;
  title: string;
}

interface MatchRunnerProps {
  projects: Project[];
  selectedProjectId?: string;
}

/**
 * 案件を選んで保存済みのマッチ結果を閲覧するためのセレクタ（マッチ実行はしない）。
 * マッチの実行は日次自動マッチ／各マッチ画面で行う。
 */
export function MatchRunner({ projects, selectedProjectId }: MatchRunnerProps) {
  const router = useRouter();
  const options = projects.map((p) => ({ value: p.id, label: p.title }));

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    router.push(id ? `/matching?projectId=${id}` : "/matching");
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="min-w-[280px]">
        <Select
          options={options}
          placeholder="案件を選択して結果を表示"
          value={selectedProjectId ?? ""}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
