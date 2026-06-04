"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  TALENT_STATUS_OPTIONS,
  GENDER_OPTIONS,
  EMPLOYMENT_OPTIONS,
  NATIONALITY_OPTIONS,
  LANGUAGE_OPTIONS,
  REMOTE_OPTIONS,
} from "@/lib/enums";

interface User {
  id: string;
  name: string;
}

interface TalentInitial {
  id: string;
  managementId?: string | null;
  status: string;
  talentType: string;
  dataFrom: string;
  assigneeId?: string | null;
  name: string;
  age?: number | null;
  gender?: string | null;
  affiliation?: string | null;
  employmentType?: string | null;
  nationality?: string | null;
  japaneseLevel?: string | null;
  englishLevel?: string | null;
  availabilityText?: string | null;
  desiredRateMin?: number | null;
  desiredRateMax?: number | null;
  remotePreference?: string | null;
  nearestStation?: string | null;
  mainSkills: string[];
  skills: string[];
  qualifications: string[];
  tags: string[];
  emailSubject?: string | null;
  note?: string | null;
}

interface TalentFormProps {
  users: User[];
  initial?: TalentInitial;
  mode: "create" | "edit";
}

function arrToStr(arr: string[]) {
  return arr.join(", ");
}

function strToArr(s: string): string[] {
  return s
    .split(/[,、]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function TalentForm({ users, initial, mode }: TalentFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [managementId, setManagementId] = useState(initial?.managementId ?? "");
  const [status, setStatus] = useState(initial?.status ?? "NONE");
  const [talentType, setTalentType] = useState(initial?.talentType ?? "INHOUSE");
  const [dataFrom, setDataFrom] = useState(initial?.dataFrom ?? "REGISTER");
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [age, setAge] = useState(initial?.age != null ? String(initial.age) : "");
  const [gender, setGender] = useState(initial?.gender ?? "");
  const [affiliation, setAffiliation] = useState(initial?.affiliation ?? "");
  const [employmentType, setEmploymentType] = useState(initial?.employmentType ?? "");
  const [nationality, setNationality] = useState(initial?.nationality ?? "");
  const [japaneseLevel, setJapaneseLevel] = useState(initial?.japaneseLevel ?? "");
  const [englishLevel, setEnglishLevel] = useState(initial?.englishLevel ?? "");
  const [availabilityText, setAvailabilityText] = useState(initial?.availabilityText ?? "");
  const [desiredRateMin, setDesiredRateMin] = useState(
    initial?.desiredRateMin != null ? String(initial.desiredRateMin) : ""
  );
  const [desiredRateMax, setDesiredRateMax] = useState(
    initial?.desiredRateMax != null ? String(initial.desiredRateMax) : ""
  );
  const [remotePreference, setRemotePreference] = useState(initial?.remotePreference ?? "");
  const [nearestStation, setNearestStation] = useState(initial?.nearestStation ?? "");
  const [mainSkills, setMainSkills] = useState(arrToStr(initial?.mainSkills ?? []));
  const [skills, setSkills] = useState(arrToStr(initial?.skills ?? []));
  const [qualifications, setQualifications] = useState(arrToStr(initial?.qualifications ?? []));
  const [tags, setTags] = useState(arrToStr(initial?.tags ?? []));
  const [emailSubject, setEmailSubject] = useState(initial?.emailSubject ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      managementId: managementId || null,
      status,
      talentType,
      dataFrom,
      assigneeId: assigneeId || null,
      name,
      age: age !== "" ? Number(age) : null,
      gender: gender || null,
      affiliation: affiliation || null,
      employmentType: employmentType || null,
      nationality: nationality || null,
      japaneseLevel: japaneseLevel || null,
      englishLevel: englishLevel || null,
      availabilityText: availabilityText || null,
      desiredRateMin: desiredRateMin !== "" ? Number(desiredRateMin) : null,
      desiredRateMax: desiredRateMax !== "" ? Number(desiredRateMax) : null,
      remotePreference: remotePreference || null,
      nearestStation: nearestStation || null,
      mainSkills: strToArr(mainSkills),
      skills: strToArr(skills),
      qualifications: strToArr(qualifications),
      tags: strToArr(tags),
      emailSubject: emailSubject || null,
      note: note || null,
    };

    try {
      const url =
        mode === "create" ? "/api/talents" : `/api/talents/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "保存に失敗しました");
      }
      router.push("/in-house-talent");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Basic info */}
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 border-b border-border pb-2">
          基本情報
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">
              名前 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              required
              placeholder="山田 太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="managementId">管理ID</Label>
            <Input
              id="managementId"
              placeholder="T-001"
              value={managementId}
              onChange={(e) => setManagementId(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="status">ステータス</Label>
            <Select
              id="status"
              options={TALENT_STATUS_OPTIONS}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="talentType">人材種別</Label>
            <Select
              id="talentType"
              options={[
                { value: "INHOUSE", label: "自社保有人材" },
                { value: "PARTNER", label: "協力会社" },
              ]}
              value={talentType}
              onChange={(e) => setTalentType(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="dataFrom">データ元</Label>
            <Select
              id="dataFrom"
              options={[
                { value: "REGISTER", label: "直登録" },
                { value: "EMAIL", label: "メール取り込み" },
              ]}
              value={dataFrom}
              onChange={(e) => setDataFrom(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="assigneeId">担当者</Label>
            <Select
              id="assigneeId"
              options={userOptions}
              placeholder="未設定"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="age">年齢</Label>
            <Input
              id="age"
              type="number"
              min={18}
              max={80}
              placeholder="30"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="gender">性別</Label>
            <Select
              id="gender"
              options={GENDER_OPTIONS}
              placeholder="未設定"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="affiliation">所属</Label>
            <Input
              id="affiliation"
              placeholder="弊社個人事業主"
              value={affiliation}
              onChange={(e) => setAffiliation(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="employmentType">雇用形態</Label>
            <Select
              id="employmentType"
              options={EMPLOYMENT_OPTIONS}
              placeholder="未設定"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
            />
          </div>
        </div>

        {dataFrom === "EMAIL" && (
          <div>
            <Label htmlFor="emailSubject">メール件名</Label>
            <Input
              id="emailSubject"
              placeholder="件名"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Availability & Rate */}
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 border-b border-border pb-2">
          稼働・報酬
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="availabilityText">稼働開始（テキスト）</Label>
            <Input
              id="availabilityText"
              placeholder="即日 or 6月〜"
              value={availabilityText}
              onChange={(e) => setAvailabilityText(e.target.value)}
            />
          </div>
          <div>
            <Label>月額報酬（万円）</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="下限"
                value={desiredRateMin}
                onChange={(e) => setDesiredRateMin(e.target.value)}
              />
              <span className="text-slate-400 shrink-0">〜</span>
              <Input
                type="number"
                placeholder="上限"
                value={desiredRateMax}
                onChange={(e) => setDesiredRateMax(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="remotePreference">リモート希望</Label>
            <Select
              id="remotePreference"
              options={REMOTE_OPTIONS}
              placeholder="未設定"
              value={remotePreference}
              onChange={(e) => setRemotePreference(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="nearestStation">最寄り駅</Label>
            <Input
              id="nearestStation"
              placeholder="渋谷"
              value={nearestStation}
              onChange={(e) => setNearestStation(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Languages & Nationality */}
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 border-b border-border pb-2">
          言語・国籍
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="nationality">国籍</Label>
            <Select
              id="nationality"
              options={NATIONALITY_OPTIONS}
              placeholder="未設定"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="japaneseLevel">日本語レベル</Label>
            <Select
              id="japaneseLevel"
              options={LANGUAGE_OPTIONS}
              placeholder="未設定"
              value={japaneseLevel}
              onChange={(e) => setJapaneseLevel(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="englishLevel">英語レベル</Label>
            <Select
              id="englishLevel"
              options={LANGUAGE_OPTIONS}
              placeholder="未設定"
              value={englishLevel}
              onChange={(e) => setEnglishLevel(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 border-b border-border pb-2">
          スキル・資格・タグ
        </h2>
        <div>
          <Label htmlFor="mainSkills">主要スキル（カンマ区切り）</Label>
          <Input
            id="mainSkills"
            placeholder="Java, Spring Boot, AWS"
            value={mainSkills}
            onChange={(e) => setMainSkills(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="skills">スキル一覧（カンマ区切り）</Label>
          <Input
            id="skills"
            placeholder="Java, Python, Docker, Kubernetes"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="qualifications">資格（カンマ区切り）</Label>
          <Input
            id="qualifications"
            placeholder="AWS認定ソリューションアーキテクト, 応用情報技術者"
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="tags">タグ（カンマ区切り）</Label>
          <Input
            id="tags"
            placeholder="即日, 英語可, リモート歓迎"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
      </div>

      {/* Note */}
      <div className="rounded-xl border border-border bg-white p-5">
        <Label htmlFor="note">メモ</Label>
        <Textarea
          id="note"
          rows={4}
          placeholder="その他メモ..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pb-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/in-house-talent")}
        >
          キャンセル
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "保存中..." : mode === "create" ? "登録" : "更新"}
        </Button>
      </div>
    </form>
  );
}
