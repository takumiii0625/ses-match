"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  TALENT_STATUS_OPTIONS,
  GENDER_OPTIONS,
  EMPLOYMENT_OPTIONS,
  NATIONALITY_OPTIONS,
  LANGUAGE_OPTIONS,
  REMOTE_OPTIONS,
} from "@/lib/enums";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  name: string;
}

interface SearchPanelProps {
  users: User[];
}

export function SearchPanel({ users }: SearchPanelProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const [query, setQuery] = useState(sp.get("query") ?? "");
  const [emailSubject, setEmailSubject] = useState(sp.get("emailSubject") ?? "");
  const [dataFrom, setDataFrom] = useState(sp.get("dataFrom") ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced filters
  const [skillsAnd, setSkillsAnd] = useState(sp.get("skillsAnd") ?? "");
  const [qualificationsOr, setQualificationsOr] = useState(sp.get("qualificationsOr") ?? "");
  const [tagsOr, setTagsOr] = useState(sp.get("tagsOr") ?? "");
  const [assigneeId, setAssigneeId] = useState(sp.get("assigneeId") ?? "");
  const [statusList, setStatusList] = useState<string[]>(
    sp.get("status") ? sp.get("status")!.split(",").filter(Boolean) : []
  );
  const [remoteList, setRemoteList] = useState<string[]>(
    sp.get("remote") ? sp.get("remote")!.split(",").filter(Boolean) : []
  );
  const [rateMin, setRateMin] = useState(sp.get("rateMin") ?? "");
  const [rateMax, setRateMax] = useState(sp.get("rateMax") ?? "");
  const [employmentType, setEmploymentType] = useState(sp.get("employmentType") ?? "");
  const [availabilityMonth, setAvailabilityMonth] = useState(sp.get("availabilityMonth") ?? "");
  const [gender, setGender] = useState(sp.get("gender") ?? "");
  const [nationality, setNationality] = useState(sp.get("nationality") ?? "");
  const [japaneseLevel, setJapaneseLevel] = useState(sp.get("japaneseLevel") ?? "");
  const [englishLevel, setEnglishLevel] = useState(sp.get("englishLevel") ?? "");
  const [ageMin, setAgeMin] = useState(sp.get("ageMin") ?? "");
  const [ageMax, setAgeMax] = useState(sp.get("ageMax") ?? "");
  const [nearestStation, setNearestStation] = useState(sp.get("nearestStation") ?? "");
  const [hasAttachment, setHasAttachment] = useState(sp.get("hasAttachment") ?? "");
  const [excludeKeyword, setExcludeKeyword] = useState(sp.get("excludeKeyword") ?? "");
  const [sort, setSort] = useState(sp.get("sort") ?? "received_desc");

  function toggleMulti(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function handleSearch() {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (emailSubject) params.set("emailSubject", emailSubject);
    if (dataFrom) params.set("dataFrom", dataFrom);
    if (skillsAnd) params.set("skillsAnd", skillsAnd);
    if (qualificationsOr) params.set("qualificationsOr", qualificationsOr);
    if (tagsOr) params.set("tagsOr", tagsOr);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (statusList.length) params.set("status", statusList.join(","));
    if (remoteList.length) params.set("remote", remoteList.join(","));
    if (rateMin) params.set("rateMin", rateMin);
    if (rateMax) params.set("rateMax", rateMax);
    if (employmentType) params.set("employmentType", employmentType);
    if (availabilityMonth) params.set("availabilityMonth", availabilityMonth);
    if (gender) params.set("gender", gender);
    if (nationality) params.set("nationality", nationality);
    if (japaneseLevel) params.set("japaneseLevel", japaneseLevel);
    if (englishLevel) params.set("englishLevel", englishLevel);
    if (ageMin) params.set("ageMin", ageMin);
    if (ageMax) params.set("ageMax", ageMax);
    if (nearestStation) params.set("nearestStation", nearestStation);
    if (hasAttachment) params.set("hasAttachment", hasAttachment);
    if (excludeKeyword) params.set("excludeKeyword", excludeKeyword);
    if (sort && sort !== "received_desc") params.set("sort", sort);
    router.push("/in-house-talent?" + params.toString());
  }

  function handleReset() {
    setQuery("");
    setEmailSubject("");
    setDataFrom("");
    setSkillsAnd("");
    setQualificationsOr("");
    setTagsOr("");
    setAssigneeId("");
    setStatusList([]);
    setRemoteList([]);
    setRateMin("");
    setRateMax("");
    setEmploymentType("");
    setAvailabilityMonth("");
    setGender("");
    setNationality("");
    setJapaneseLevel("");
    setEnglishLevel("");
    setAgeMin("");
    setAgeMax("");
    setNearestStation("");
    setHasAttachment("");
    setExcludeKeyword("");
    setSort("received_desc");
    router.push("/in-house-talent");
  }

  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  return (
    <div className="rounded-xl border border-border bg-white shadow-sm">
      {/* Main search bar */}
      <div className="p-4 border-b border-border">
        {/* Tabs */}
        <div className="flex gap-2 mb-3">
          {[
            { value: "", label: "すべて" },
            { value: "REGISTER", label: "直登録" },
            { value: "EMAIL", label: "メール" },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setDataFrom(tab.value)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                dataFrom === tab.value
                  ? "bg-primary text-white"
                  : "text-slate-500 hover:bg-slate-100"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
          <div className="flex-1">
            <Label>メール件名</Label>
            <Input
              placeholder="件名で検索"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
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
          {/* Row 1: Skills, Qualifications, Tags */}
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
              <Label>資格（OR, カンマ区切り）</Label>
              <Input
                placeholder="AWS認定, 応用情報"
                value={qualificationsOr}
                onChange={(e) => setQualificationsOr(e.target.value)}
              />
            </div>
            <div>
              <Label>タグ（OR, カンマ区切り）</Label>
              <Input
                placeholder="即日, 英語可"
                value={tagsOr}
                onChange={(e) => setTagsOr(e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: Assignee, Sort, Employment */}
          <div className="grid grid-cols-3 gap-4">
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
            <div>
              <Label>雇用形態</Label>
              <Select
                options={EMPLOYMENT_OPTIONS}
                placeholder="すべて"
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
              />
            </div>
          </div>

          {/* Row 3: Status multi-select */}
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

          {/* Row 4: Remote multi-select */}
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

          {/* Row 5: Rate range, Availability, Station */}
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

          {/* Row 6: Gender, Nationality, Age */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>性別</Label>
              <Select
                options={GENDER_OPTIONS}
                placeholder="すべて"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              />
            </div>
            <div>
              <Label>国籍</Label>
              <Select
                options={NATIONALITY_OPTIONS}
                placeholder="すべて"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
              />
            </div>
            <div>
              <Label>年齢範囲</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="下限"
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  className="w-full"
                />
                <span className="text-slate-400 shrink-0">〜</span>
                <Input
                  type="number"
                  placeholder="上限"
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Row 7: Language levels */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>日本語レベル</Label>
              <Select
                options={LANGUAGE_OPTIONS}
                placeholder="すべて"
                value={japaneseLevel}
                onChange={(e) => setJapaneseLevel(e.target.value)}
              />
            </div>
            <div>
              <Label>英語レベル</Label>
              <Select
                options={LANGUAGE_OPTIONS}
                placeholder="すべて"
                value={englishLevel}
                onChange={(e) => setEnglishLevel(e.target.value)}
              />
            </div>
          </div>

          {/* Row 8: Attachment, Exclude keyword */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>添付ファイル</Label>
              <Select
                options={[
                  { value: "yes", label: "あり" },
                  { value: "no", label: "なし" },
                ]}
                placeholder="すべて"
                value={hasAttachment}
                onChange={(e) => setHasAttachment(e.target.value)}
              />
            </div>
            <div>
              <Label>除外キーワード</Label>
              <Input
                placeholder="除外したいキーワード"
                value={excludeKeyword}
                onChange={(e) => setExcludeKeyword(e.target.value)}
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
