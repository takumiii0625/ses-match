"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  TALENT_STATUS_OPTIONS,
  REMOTE_OPTIONS,
} from "@/lib/enums";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  name: string;
}

interface PartnerSearchPanelProps {
  users: User[];
}

export function PartnerSearchPanel({ users }: PartnerSearchPanelProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const [query, setQuery] = useState(sp.get("query") ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced filters
  const [skillsAnd, setSkillsAnd] = useState(sp.get("skillsAnd") ?? "");
  const [assigneeId, setAssigneeId] = useState(sp.get("assigneeId") ?? "");
  const [statusList, setStatusList] = useState<string[]>(
    sp.get("status") ? sp.get("status")!.split(",").filter(Boolean) : []
  );
  const [remoteList, setRemoteList] = useState<string[]>(
    sp.get("remote") ? sp.get("remote")!.split(",").filter(Boolean) : []
  );
  const [rateMin, setRateMin] = useState(sp.get("rateMin") ?? "");
  const [rateMax, setRateMax] = useState(sp.get("rateMax") ?? "");
  const [availabilityMonth, setAvailabilityMonth] = useState(sp.get("availabilityMonth") ?? "");
  const [nearestStation, setNearestStation] = useState(sp.get("nearestStation") ?? "");
  const [sort, setSort] = useState(sp.get("sort") ?? "received_desc");

  function toggleMulti(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function handleSearch() {
    const params = new URLSearchParams();
    // talentType is intentionally NOT included — the server forces it to PARTNER.
    if (query) params.set("query", query);
    if (skillsAnd) params.set("skillsAnd", skillsAnd);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (statusList.length) params.set("status", statusList.join(","));
    if (remoteList.length) params.set("remote", remoteList.join(","));
    if (rateMin) params.set("rateMin", rateMin);
    if (rateMax) params.set("rateMax", rateMax);
    if (availabilityMonth) params.set("availabilityMonth", availabilityMonth);
    if (nearestStation) params.set("nearestStation", nearestStation);
    if (sort && sort !== "received_desc") params.set("sort", sort);
    router.push("/partner-talent?" + params.toString());
  }

  function handleReset() {
    setQuery("");
    setSkillsAnd("");
    setAssigneeId("");
    setStatusList([]);
    setRemoteList([]);
    setRateMin("");
    setRateMax("");
    setAvailabilityMonth("");
    setNearestStation("");
    setSort("received_desc");
    router.push("/partner-talent");
  }

  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  return (
    <div className="rounded-xl border border-border bg-white shadow-sm">
      {/* Main search bar */}
      <div className="p-4 border-b border-border">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>キーワード</Label>
            <Input
              placeholder="名前・スキル・メモなどで検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button variant="primary" onClick={handleSearch} className="shrink-0">
            検索
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowAdvanced((v) => !v)}
            className="shrink-0"
          >
            詳細条件 {showAdvanced ? "▲" : "▼"}
          </Button>
        </div>
      </div>

      {/* Advanced conditions */}
      {showAdvanced && (
        <div className="p-4 space-y-4">
          {/* Row 1: Skills AND, Assignee, Sort */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>経験スキル（AND, カンマ区切り）</Label>
              <Input
                placeholder="Java, AWS, React"
                value={skillsAnd}
                onChange={(e) => setSkillsAnd(e.target.value)}
              />
            </div>
            <div>
              <Label>担当者</Label>
              <Select
                options={userOptions}
                placeholder="すべて"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              />
            </div>
            <div>
              <Label>並び順</Label>
              <Select
                options={[
                  { value: "received_desc", label: "配信日（新しい順）" },
                  { value: "received_asc", label: "配信日（古い順）" },
                  { value: "rate_desc", label: "単価（高い順）" },
                  { value: "rate_asc", label: "単価（低い順）" },
                ]}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: Status multi-select */}
          <div>
            <Label>ステータス</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {TALENT_STATUS_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statusList.includes(opt.value)}
                    onChange={() => toggleMulti(statusList, setStatusList, opt.value)}
                    className="rounded text-primary"
                  />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Row 3: Remote multi-select */}
          <div>
            <Label>リモート希望</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {REMOTE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remoteList.includes(opt.value)}
                    onChange={() => toggleMulti(remoteList, setRemoteList, opt.value)}
                    className="rounded text-primary"
                  />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Row 4: Rate range, Availability, Station */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>月額報酬（万円）</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="下限"
                  value={rateMin}
                  onChange={(e) => setRateMin(e.target.value)}
                  className="w-full"
                />
                <span className="text-slate-400 shrink-0">〜</span>
                <Input
                  type="number"
                  placeholder="上限"
                  value={rateMax}
                  onChange={(e) => setRateMax(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <div>
              <Label>稼働開始月</Label>
              <Input
                type="month"
                value={availabilityMonth}
                onChange={(e) => setAvailabilityMonth(e.target.value)}
              />
            </div>
            <div>
              <Label>最寄り駅</Label>
              <Input
                placeholder="渋谷、新宿など"
                value={nearestStation}
                onChange={(e) => setNearestStation(e.target.value)}
              />
            </div>
          </div>

          {/* Reset button */}
          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleReset}>
              条件をリセット
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
