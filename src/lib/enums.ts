// Japanese labels for the domain enums (single source of truth for UI).

export const TALENT_STATUS_LABELS: Record<string, string> = {
  NONE: "-",
  PROPOSING: "提案中",
  ACTIVE: "稼働中",
  CLOSED: "クローズ",
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  OPEN: "募集中",
  PROPOSING: "提案中",
  DECIDED: "決定",
  CLOSED: "クローズ",
};

export const GENDER_LABELS: Record<string, string> = {
  MALE: "男性",
  FEMALE: "女性",
  OTHER: "その他",
};

export const EMPLOYMENT_LABELS: Record<string, string> = {
  EMPLOYEE: "社員",
  FREELANCE: "個人事業主/フリーランス",
};

export const NATIONALITY_LABELS: Record<string, string> = {
  JAPAN: "日本",
  OTHER: "その他",
};

export const LANGUAGE_LABELS: Record<string, string> = {
  NATIVE: "ネイティブ",
  BUSINESS: "ビジネス",
  DAILY: "日常会話",
  NONE: "-",
};

export const REMOTE_LABELS: Record<string, string> = {
  FULL_REMOTE: "フルリモート",
  MOSTLY_REMOTE: "基本リモート",
  HYBRID: "ハイブリッド",
  OFFICE_1: "週1回出社可",
  OFFICE_2: "週2回出社可",
  OFFICE_3: "週3回出社可",
  OFFICE_4: "週4回出社可",
  ONSITE: "常駐可",
};

export const TALENT_TYPE_LABELS: Record<string, string> = {
  INHOUSE: "自社保有人材",
  PARTNER: "協力会社",
};

export const DATA_SOURCE_LABELS: Record<string, string> = {
  REGISTER: "直登録",
  EMAIL: "メール",
};

/** Build {value,label}[] options from a label map for <select> */
export function toOptions(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

export const TALENT_STATUS_OPTIONS = toOptions(TALENT_STATUS_LABELS);
export const PROJECT_STATUS_OPTIONS = toOptions(PROJECT_STATUS_LABELS);
export const GENDER_OPTIONS = toOptions(GENDER_LABELS);
export const EMPLOYMENT_OPTIONS = toOptions(EMPLOYMENT_LABELS);
export const NATIONALITY_OPTIONS = toOptions(NATIONALITY_LABELS);
export const LANGUAGE_OPTIONS = toOptions(LANGUAGE_LABELS);
export const REMOTE_OPTIONS = toOptions(REMOTE_LABELS);
