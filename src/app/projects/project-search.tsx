"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PROJECT_STATUS_OPTIONS, REMOTE_OPTIONS } from "@/lib/enums";
import type { User } from "@prisma/client";

interface Props {
  users: User[];
}

export function ProjectSearch({ users }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const push = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(sp.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      startTransition(() => router.replace(`${pathname}?${params.toString()}`));
    },
    [router, pathname, sp],
  );

  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  return (
    <div className="flex flex-col gap-3">
      {/* keyword */}
      <div className="flex gap-2">
        <Input
          placeholder="キーワード（案件名・スキル・クライアント）"
          defaultValue={sp.get("query") ?? ""}
          onChange={(e) => push("query", e.target.value)}
          className="max-w-md"
        />
        <Input
          placeholder="除外キーワード"
          defaultValue={sp.get("excludeKeyword") ?? ""}
          onChange={(e) => push("excludeKeyword", e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* filter row */}
      <div className="flex flex-wrap gap-2">
        <Select
          options={PROJECT_STATUS_OPTIONS}
          placeholder="ステータス"
          value={sp.get("status") ?? ""}
          onChange={(e) => push("status", e.target.value)}
          className="w-36"
        />
        <Select
          options={REMOTE_OPTIONS}
          placeholder="リモート"
          value={sp.get("remote") ?? ""}
          onChange={(e) => push("remote", e.target.value)}
          className="w-40"
        />
        <Select
          options={userOptions}
          placeholder="担当者"
          value={sp.get("assigneeId") ?? ""}
          onChange={(e) => push("assigneeId", e.target.value)}
          className="w-36"
        />
        <Input
          placeholder="必須スキル（AND, カンマ区切り）"
          defaultValue={sp.get("requiredSkillsAnd") ?? ""}
          onChange={(e) => push("requiredSkillsAnd", e.target.value)}
          className="w-56"
        />
        <Input
          placeholder="単価下限（万）"
          type="number"
          defaultValue={sp.get("rateMin") ?? ""}
          onChange={(e) => push("rateMin", e.target.value)}
          className="w-32"
        />
        <Input
          placeholder="単価上限（万）"
          type="number"
          defaultValue={sp.get("rateMax") ?? ""}
          onChange={(e) => push("rateMax", e.target.value)}
          className="w-32"
        />
        <Input
          placeholder="最寄り駅"
          defaultValue={sp.get("nearestStation") ?? ""}
          onChange={(e) => push("nearestStation", e.target.value)}
          className="w-36"
        />
        <Select
          options={[
            { value: "received_desc", label: "受信日（新しい順）" },
            { value: "received_asc", label: "受信日（古い順）" },
            { value: "rate_desc", label: "単価（高い順）" },
            { value: "rate_asc", label: "単価（低い順）" },
          ]}
          placeholder="並び順"
          value={sp.get("sort") ?? ""}
          onChange={(e) => push("sort", e.target.value)}
          className="w-44"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            startTransition(() => router.replace(pathname));
          }}
        >
          クリア
        </Button>
      </div>
    </div>
  );
}
