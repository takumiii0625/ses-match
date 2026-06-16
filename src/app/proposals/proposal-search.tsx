"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

/** 提案管理の検索（案件名・人材名・クライアントで絞り込み）。URLの ?q= を更新する。 */
export function ProposalSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(initial);

  function apply(q: string) {
    const params = new URLSearchParams(sp.toString());
    if (q.trim()) params.set("q", q);
    else params.delete("q");
    startTransition(() => router.replace(`/proposals?${params.toString()}`));
  }

  return (
    <div className="max-w-md">
      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          apply(e.target.value);
        }}
        placeholder="案件名・人材名・クライアントで検索"
      />
    </div>
  );
}
