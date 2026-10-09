import { Prisma, type Project, type Talent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  prefilterCandidates,
  isSameCompany,
  isStrictDirectChannel,
  dedupeProjectsForMatch,
  DEFAULT_RATE_TOLERANCE_MAN,
  regionOf,
  projectRequiresOnsite,
  remoteMismatch,
} from "@/lib/matching";
import { getAI } from "@/lib/ai";
import type { MatchProjectInput, MatchCandidateInput, SkillYear } from "@/lib/ai";
import { DEFAULT_MATCH_PROMPT } from "@/lib/ai/prompts";
import { pregenerateProjectBodies } from "@/lib/email/project-mail";
import { loadNgDomains, isNgDomain } from "@/lib/ng-company";
import {
  type MatchConfig,
  parseMatchConfig,
  matchConfigPromptAddon,
} from "@/lib/match-config";

// マッチとして保存する最低スコア。rematch・取込後の自動マッチで共通。
// 70-79 も保存はする（自動送信は80+のみ・一覧表示も80+のみ。70-79は将来の閾値調整の余地として残す）。
export const MIN_SCORE = 70;

// マッチ一覧・自社保有人材/案件マッチの各画面で「表示する」最低スコア。
// 保存(MIN_SCORE=70)より高くして、確度の高い80点以上だけを一覧に出す。
export const DISPLAY_MIN_SCORE = 80;

// マッチ処理で実際に使う列だけ取得する。emailBody（フルのメール本文）等の重い列を
// 読まないことで、Neonのネットワーク転送量を大幅に削減する（無料枠の超過対策）。
const TALENT_MATCH_SELECT = {
  id: true,
  name: true,
  age: true,
  nationality: true,
  japaneseLevel: true,
  talentType: true,
  employmentType: true, // 個人事業主不可の足切りに使う（未設定は所属テキストで判定）。
  isOwnEmployee: true, // 自社社員(プロパー)かの商流判定に使う（貴社止まり含む）。
  affiliation: true,
  mainSkills: true,
  skills: true,
  skillYears: true,
  desiredRateMin: true,
  desiredRateMax: true,
  remotePreference: true,
  availabilityText: true,
  nearestStation: true,
  note: true,
  sourceEmail: true,
  createdAt: true, // 「新規（当日取込）」判定に使う。
} satisfies Prisma.TalentSelect;

const PROJECT_MATCH_SELECT = {
  id: true,
  title: true,
  clientName: true,
  requiredSkills: true,
  rateMin: true,
  rateMax: true,
  remotePreference: true,
  location: true,
  startText: true,
  description: true,
  channelText: true,
  supportFee: true,
  sourceEmail: true,
  emailSubject: true,
  receivedDate: true,
  requiredSkillYears: true,
  createdAt: true, // 「新規（当日取込）」判定に使う。
} satisfies Prisma.ProjectSelect;

// 案件・他社人材は「直近に取り込んだ分」に限定するが、自社保有人材(INHOUSE)は
// 常に対象（保有ロスターなので取込日に関係なく提案候補にする）。
// 窓の基準は createdAt(取込日)。receivedDate(メール配信日)は古いバックログを取り込むと
// 当日でも過去日付になり窓から外れてしまうため使わない（取込したのに未マッチを防ぐ）。
const talentWindowWhere = (orgId: string, since: Date) => ({
  orgId,
  OR: [{ talentType: "INHOUSE" as const }, { createdAt: { gte: since } }],
});

// 1案件あたりLLMに渡す候補の上限（事前フィルタ後の上位N件）。
const SHORTLIST_LIMIT = 30;

// 新規と突き合わせる「直近」の範囲（取込日 createdAt の日数）。
// 新規案件は直近この日数の人材と、新規人材は直近この日数の案件とマッチする。
// 広げるほどマッチ網羅は上がるがLLMコストも増える。env MATCH_WINDOW_DAYS で調整可（既定3日）。
export const MATCH_WINDOW_DAYS = Number(process.env.MATCH_WINDOW_DAYS ?? "3") || 3;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 取込時の差分マッチ用：今からこの日数前まで。 */
function windowStart(): Date {
  return new Date(Date.now() - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** 今日(JST)の0:00をUTCのDateで返す。手動の全件マッチは「今日の取込」だけを対象にする。 */
function startOfTodayJst(): Date {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  jst.setUTCHours(0, 0, 0, 0);
  return new Date(jst.getTime() - JST_OFFSET_MS);
}

/**
 * 商流が「貴社まで＝受信会社(貴社)止まり」の案件か。弊社以遠の人材を提案できないため
 * マッチング対象を貴社チェック付き自社人材だけに絞る（restrictCandidatesByChannel）。
 *
 * 表現ゆれに強く判定する: 貴社/御社 の直後（間に「の」「様」「個人」等の限定語が入る形も許容）に
 * 「正社員 / 社員 / プロパー / 所属 / 要員 / フリーランス / 直 / 個人(事業主) / まで / 迄 / のみ」が続くものを「貴社止まり」とみなす。
 * さらに「御社/貴社の方(かた)まで」＝御社所属の方まで、も貴社止まりとみなす（方針/方向/方法/方式/方面は除外）。
 * 例: 貴社まで・貴社のみ・貴社社員・貴社プロパー・貴社所属(まで)・貴社の正社員様まで・御社の方まで・
 *     貴社個人まで・貴社個人事業主まで・貴社所属個人まで。
 * 「貴社の2社先まで」「貴社から1社先」等（貴社の後に『N社先』『から』を挟む）は範囲拡大なので対象外（誤検知しない）。
 */
function isOwnOnlyChannel(channelText: string | null): boolean {
  if (!channelText) return false;
  const t = channelText.replace(/\s/g, "");
  // (1) 貴社/御社(の)? の直後が止まり語（個人/個人事業主 も含む）。
  if (/(貴社|御社)の?(正?社員|プロパー|所属|要員|フリーランス|直|個人事業主|個人|まで|迄|のみ)/.test(t)) {
    return true;
  }
  // (2) 貴社/御社 … まで/迄/のみ（間に個人・社員・所属・方・様・の 等の限定語のみ）。
  //     ただし間に「N社先/N社下」や「から」を挟むもの（＝範囲拡大）は貴社止まりではないので除外する。
  const m = t.match(/(貴社|御社)([^]{0,8}?)(まで|迄|のみ)/);
  if (m && !/[0-9０-９一二三四五六七八九]社(先|下)|から/.test(m[2])) return true;
  // (3) 「御社/貴社の方(かた)…」＝御社所属の方。方針/方向/方法/方式/方面 は除外。
  return /(貴社|御社)の方(?![針向法式面])/.test(t);
}

const KANJI_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
/** 1文字の数字（半角/全角/漢数字）→ 数値。判定不能は NaN。 */
function charToNum(ch: string): number {
  if (/[0-9]/.test(ch)) return Number(ch);
  if (/[０-９]/.test(ch)) return ch.charCodeAt(0) - "０".charCodeAt(0);
  return KANJI_NUM[ch] ?? NaN;
}

/** 案件の商流制限(channelText)が許容する「自社視点での深さ（N社先まで）」。
 *  「2社先まで/2社先可/貴社の2社先まで」→2。明示が無ければ null（未指定）。 */
function allowedDepthFromChannel(channelText: string | null): number | null {
  if (!channelText) return null;
  const m = channelText.replace(/\s/g, "").match(/([0-9０-９一二三四五六七八九])社(先|下)/);
  if (!m) return null;
  const n = charToNum(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 自社保有かつ自社社員（プロパー相当）か。自社視点で最も浅い(深さ0)扱いになる。
 *  isOwnEmployee が明示的に false のときだけ「自社社員でない保有人材」として一段深く扱う。
 *  （既存データ=未設定/true はプロパー扱いで従来どおり） */
function isOwnProper(t: Talent): boolean {
  return t.talentType === "INHOUSE" && t.isOwnEmployee === true;
}

/** 人材の「自社視点の商流の深さ」。送信元プロパー=1社先、送信元「1社先」=2社先…。
 *  他社人材(PARTNER): affiliation の「N社先/N社下」の N（無ければ0）＋自社が仲介する +1。
 *  自社保有(INHOUSE): 自社社員=0（プロパー）。自社社員でない保有人材(isOwnEmployee=false)=1（一段深い）。 */
function talentDepthFromUs(t: Talent): number {
  if (t.talentType === "INHOUSE") return t.isOwnEmployee === true ? 0 : 1;
  const m = (t.affiliation ?? "").replace(/\s/g, "").match(/([0-9０-９一二三四五六七八九])社(先|下)/);
  const hops = m ? charToNum(m[1]) : 0;
  return (Number.isFinite(hops) ? hops : 0) + 1;
}

/**
 * 案件の商流が「弊社/当社(=案件の送信元)」を基準に書かれているか。
 * 送信元(弊社)は自社(我々)の1つ上流なので、「弊社のN社先」は自社視点で N-1 になる。
 * 例:「エンド→弊社（1社先様の場合は支援費）」「弊社まで」「弊社の2社先まで」「当社止まり」。
 * ※「貴社/御社」(=受信会社=我々)基準は別物なので対象外（isOwnOnlyChannelで処理）。
 */
function isSenderAnchoredChannel(channelText: string | null): boolean {
  if (!channelText) return false;
  const t = channelText.replace(/\s/g, "");
  return (
    /(→|->|―>|ー>)(弊社|当社)/.test(t) ||
    /(弊社|当社)(まで|迄|止まり|の|様|\(|（|直|プロパー|正?社員|所属|要員|フリーランス)/.test(t)
  );
}

/**
 * 弊社(送信元)基準の案件が許容する「自社視点の深さ」。
 * 「弊社のN社先」は自社視点 N-1（弊社=自社の1つ上流）。N無しの弊社止まりは自社視点0(=自社保有INHOUSEのみ)。
 * 例:「エンド→弊社（1社先様は支援費）」→ N=1 → 自社視点0 → 他社人材は不可（自社のみ）。
 */
function senderAnchoredAllowedDepth(channelText: string | null): number {
  const n = allowedDepthFromChannel(channelText); // 弊社基準の「N社先」（無ければnull）
  return n != null ? Math.max(0, n - 1) : 0;
}

/** 案件が「個人事業主/フリーランス不可（法人契約のみ・社員のみ）」を明示しているか（channelText＋概要で判定）。 */
function projectDisallowsFreelance(project: Project): boolean {
  const t = `${project.channelText ?? ""}\n${project.description ?? ""}`.replace(/[ 　]/g, "");
  if (/(個人事業主|個人事業|フリーランス|ﾌﾘｰﾗﾝｽ)(は|の方)?(不可|不採用|NG|ng|お断り|除く|以外|禁止|不採用)/.test(t)) {
    return true;
  }
  // 「法人のみ/法人契約のみ/法人限定」「社員のみ/正社員のみ/社員限定/正社員限定」も個人事業主を除外する意味。
  // ※「貴社社員まで」等の貴社止まりは isOwnOnlyChannel で別処理（のみ/限定だけ拾う）。
  return /法人(契約)?(のみ|限定)/.test(t) || /(正)?社員(のみ|限定)/.test(t);
}

/** 人材が個人事業主/フリーランスか（雇用形態 or 所属テキストで判定）。取込人材は所属テキストが主。 */
function isFreelanceTalent(t: Talent): boolean {
  if (t.employmentType === "FREELANCE") return true;
  return /(フリーランス|個人事業主|個人事業|ﾌﾘｰﾗﾝｽ)/.test((t.affiliation ?? "").replace(/\s/g, ""));
}

/**
 * 案件が「再委託不可/禁止」を明示しているか。再委託＝下請けに出すこと。禁止なら他社人材(PARTNER)は
 * 出せない（自社直接保有のみ）。※「再委託：2社先まで可」等の“許可”表現は対象外（不可/禁止/NG等の明示だけ拾う）。
 */
function projectDisallowsSubcontract(project: Project): boolean {
  const t = `${project.channelText ?? ""}\n${project.description ?? ""}`.replace(/[ 　]/g, "");
  return /再委託(は|も)?(不可|禁止|NG|ng|お断り|なし|不可希望)/.test(t);
}

/**
 * 案件が「派遣契約必須/派遣のみ/派遣限定」を要求しているか。我々は派遣免許が無く派遣できないため、
 * 他社人材(PARTNER)は提案不可。※「派遣先」等の誤検知を避け、必須/のみ/限定の明示に限定する。
 */
function projectRequiresHaken(project: Project): boolean {
  const t = `${project.channelText ?? ""}\n${project.description ?? ""}`.replace(/[ 　]/g, "");
  return /派遣(契約)?(必須|のみ|限定)/.test(t);
}

/**
 * 商流による候補の事前足切り。
 * - 個人事業主不可: 案件が「個人事業主/フリーランス不可・法人契約のみ」なら、フリーランス人材を
 *   除外（自社・他社問わず）。契約形態はLLM任せにせず構造的に落とす。
 * - 商流の深さ制限: 他社人材の「自社視点の深さ」が案件の許容（channelTextの「N社先まで」）を
 *   超えるなら除外。案件が深さを明示していなければ既定は「自社から1社先（=送信元プロパー）」まで＝
 *   送信元から1社先以上の人材（自社視点2社先以上）は除外。支援費ありなら1段緩める。
 * - 「貴社社員/貴社まで」案件 → 自社保有人材のうち「貴社チェック(kishaOk)」が付いた人材のみ。
 * - 「エンド直/プロパー/直のみ」案件で支援費の記載なし → 他社人材を除外し自社保有人材のみ。
 */
function restrictCandidatesByChannel(candidates: Talent[], project: Project): Talent[] {
  // 個人事業主不可 → フリーランス人材を除外（自社・他社問わず。商流判定より前に落とす）。
  let list = candidates;
  if (projectDisallowsFreelance(project)) {
    list = list.filter((t) => !isFreelanceTalent(t));
  }
  // 再委託不可 → 他社人材(PARTNER)は出せない（自社直接のみ）。派遣必須 → 派遣できない我々は他社不可。
  // どちらも「自社社員(プロパー)のみ」に絞る（自社社員でない保有人材=再委託/派遣不可相当なので除外）。
  if (projectDisallowsSubcontract(project) || projectRequiresHaken(project)) {
    list = list.filter((t) => isOwnProper(t));
  }
  const ownOnly = isOwnOnlyChannel(project.channelText);
  if (ownOnly) {
    // 貴社止まり＝我々プロパーのみ＝自社社員(isOwnEmployee)だけ。
    return list.filter((t) => isOwnProper(t));
  }
  // 弊社(送信元)基準の商流: 「弊社のN社先」は自社視点 N-1。弊社止まり(N無し)は自社社員(深さ0)のみ。
  // 「1社先様は支援費」等の支援費は「弊社→自社」の1段を埋める条件で、他社をさらに深く許容しない
  // （ここでは support費を加算しない）。例「エンド→弊社（1社先様は支援費）」→ 自社視点0=自社社員のみ。
  if (isSenderAnchoredChannel(project.channelText)) {
    const cap = senderAnchoredAllowedDepth(project.channelText);
    return list.filter((t) => isOwnProper(t) || talentDepthFromUs(t) <= cap);
  }
  const strictDirect = isStrictDirectChannel(project.channelText) && !project.supportFee;
  if (strictDirect) {
    // エンド直/プロパーのみ＝自社視点0。自社社員(プロパー)のみ（自社社員でない保有人材は一段深いので不可）。
    return list.filter((t) => isOwnProper(t));
  }
  // 商流の深さ: 案件の許容（N社先まで）を超える人材は除外。未指定は既定=1社先まで。
  // 支援費ありは1段深くても可（商流を飛ばせる）。自社社員(深さ0)は常に対象、
  // 自社社員でない保有人材(深さ1)・他社人材は深さ判定にかける。
  const allowed = allowedDepthFromChannel(project.channelText);
  const cap = (allowed ?? 1) + (project.supportFee ? 1 : 0);
  return list.filter(
    (t) => isOwnProper(t) || talentDepthFromUs(t) <= cap,
  );
}

/** 案件が「外国籍不可（日本国籍のみ）」を明示しているか。可/歓迎/不問はNG制限ではない。 */
function requiresJapaneseOnly(project: Project): boolean {
  const t = `${project.channelText ?? ""}\n${project.description ?? ""}`.replace(/[ 　]/g, "");
  if (/(外国籍|外国人|国籍)(は|も|の方も)?(可|歓迎|不問|問わず|相談|OK|ok)/.test(t)) return false;
  return /外国籍(不可|不採用|NG|ng|お断り|以外|の方は不可)|日本国籍(のみ|限定|必須)|日本人(のみ|限定)/.test(t);
}

/**
 * 国籍による候補の除外。案件が「外国籍不可（日本国籍のみ）」を明示している場合、
 * 外国籍(nationality=OTHER)の人材を除外する（自社保有(INHOUSE)含む・帰化者も抽出時にOTHER）。
 * 日本籍(JAPAN)・未記載(=日本人扱いでJAPAN)は残す。
 */
function restrictCandidatesByNationality(candidates: Talent[], project: Project): Talent[] {
  if (!requiresJapaneseOnly(project)) return candidates;
  return candidates.filter((t) => t.nationality !== "OTHER");
}

/**
 * 取引NG企業による候補の除外。
 * - 自社保有人材(INHOUSE)はNG企業でも提案対象に含める（NG企業の案件にも自社人材は出す）。
 * - 案件の会社がNG → 他社人材は提案しない（除外）。
 * - 人材の会社がNG → その他社人材は除外。
 */
function restrictCandidatesByNg(candidates: Talent[], ng: Set<string>): Talent[] {
  if (ng.size === 0) return candidates;
  // NG企業の「人材」は提案しない（除外）。NG企業の「案件」は通常どおりマッチ可
  // （他社人材ともマッチさせる）。自社保有人材は常に対象。
  return candidates.filter((t) => {
    if (t.talentType === "INHOUSE") return true;
    return !isNgDomain(t.sourceEmail, ng);
  });
}

/**
 * 勤務地（地方区分）による候補の事前足切り。
 * 出社あり案件（常駐・出社・ハイブリッド等）で、案件の地方と人材の居住地方が「どちらも確実に判定でき」
 * かつ「異なる」場合のみ除外（例：東京常駐 × 大阪在住）。
 * フルリモート／どちらかが不明（地名の記載なし・曖昧）なら通す（方針：不明は落とさない）。
 */
function restrictCandidatesByLocation(candidates: Talent[], project: Project): Talent[] {
  if (!projectRequiresOnsite(project)) return candidates;
  const projRegion = regionOf(project.location);
  if (!projRegion) return candidates; // 案件の地域が不明 → 絞れない
  return candidates.filter((t) => {
    // 人材の居住地方は最寄駅＋メモ＋所属テキストから推定（不明なら通す）。
    const talentRegion = regionOf(
      `${t.nearestStation ?? ""} ${t.note ?? ""} ${t.affiliation ?? ""}`,
    );
    if (!talentRegion) return true; // 人材の地域が不明 → 通す
    return talentRegion === projRegion; // 一致のみ残す（異なる地方は除外）
  });
}

/**
 * リモート/出社条件による候補の事前足切り。
 * 人材の出社許容頻度が案件の要求出社頻度に満たない場合に除外（例: 常駐案件×フルリモート人材）。
 * どちらかの希望が不明なら通す（方針: 不明は落とさない）。
 */
function restrictCandidatesByRemote(candidates: Talent[], project: Project): Talent[] {
  return candidates.filter((t) => !remoteMismatch(project, t));
}

/**
 * 設定(gates)に応じて決定的な除外ゲートを適用する。
 * - 同一企業除外・NG企業は安全ゲートとして常時適用（設定で切れない）。
 * - 商流/国籍/勤務地はマッチ設定のトグルに従い適用（OFF＝点数で見るだけ）。
 * - 単価/言語/カバー率は prefilterCandidates 側でトグル適用する。
 * pool は呼び出し側で同一企業・判定済みペアを除いた候補。
 */
function buildCandidates(
  pool: Talent[],
  project: Project,
  ngDomains: Set<string>,
  gates: MatchConfig["gates"],
): Talent[] {
  let c = restrictCandidatesByNg(pool, ngDomains); // 安全ゲート（常時）
  if (gates.channel) c = restrictCandidatesByChannel(c, project);
  if (gates.nationality) c = restrictCandidatesByNationality(c, project);
  if (gates.location) c = restrictCandidatesByLocation(c, project);
  if (gates.remote) c = restrictCandidatesByRemote(c, project);
  return c;
}

export interface MatchRunResult {
  projects: number;
  talents: number;
  pairs: number; // LLM判定にかけた候補ペア数（事前フィルタ通過分）
  saved: number; // MIN_SCORE 以上で upsert したペア数
  errors: number; // LLM判定に失敗した案件数（1案件の失敗で全体を止めない）
  minScore: number;
}

function toProjectInput(p: Project): MatchProjectInput {
  return {
    title: p.title,
    clientName: p.clientName,
    requiredSkills: p.requiredSkills,
    requiredSkillYears: (p.requiredSkillYears as unknown as SkillYear[] | null) ?? undefined,
    rateMin: p.rateMin,
    rateMax: p.rateMax,
    remotePreference: p.remotePreference,
    location: p.location,
    startText: p.startText,
    description: p.description,
    channelText: p.channelText,
    supportFee: p.supportFee,
  };
}

function toCandidateInput(t: Talent): MatchCandidateInput {
  return {
    talentId: t.id,
    name: t.name,
    age: t.age,
    nationality: t.nationality,
    japaneseLevel: t.japaneseLevel,
    talentType: t.talentType,
    affiliation: t.affiliation,
    skills: [...new Set([...t.mainSkills, ...t.skills])],
    skillYears: (t.skillYears as unknown as SkillYear[] | null) ?? undefined,
    desiredRateMin: t.desiredRateMin,
    desiredRateMax: t.desiredRateMax,
    remotePreference: t.remotePreference,
    availabilityText: t.availabilityText,
    nearestStation: t.nearestStation,
    note: t.note,
  };
}

/** 組織のマッチ判定プロンプト＋案件メール整形＋差し戻し学習（未設定なら null）。 */
async function resolveOrgPrompts(
  orgId: string,
): Promise<{
  matchPrompt: string | undefined;
  projectEmailPrompt: string | null;
  rateToleranceMan: number;
  languageMatchAll: boolean;
  config: MatchConfig;
}> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      matchPrompt: true,
      projectEmailPrompt: true,
      matchLearnings: true,
      rateToleranceMan: true,
      languageMatchAll: true,
      matchConfig: true,
    },
  });
  const rateToleranceMan = org?.rateToleranceMan ?? DEFAULT_RATE_TOLERANCE_MAN;
  const languageMatchAll = org?.languageMatchAll ?? false;
  const config = parseMatchConfig(org?.matchConfig);
  // 差し戻し学習があれば、マッチ判定プロンプトに「提案不可＝除外」の指示として付加する。
  const base = org?.matchPrompt ?? DEFAULT_MATCH_PROMPT;
  const learnings = org?.matchLearnings?.trim();
  const withLearnings = learnings
    ? `${base}\n\n【営業の差し戻し傾向（過去に営業が「送らない」と判断したパターン。以下に明確に該当するマッチは提案不可とみなし、score を MIN_SCORE 未満まで大きく下げて除外する。曖昧なものは通常どおり判定）】\n${learnings}`
    : base;
  // 単価の許容超過マージンを明示（事前フィルタで既に案件上限+tol万以内に絞り込み済み。rateOk判定を整合させる）。
  const withRate = `${withLearnings}\n\n【単価の許容超過マージン】${rateToleranceMan}万。人材の希望単価が「案件の想定単価上限＋${rateToleranceMan}万」以内なら rateOk=true（逆ザヤ・薄利でも許容内として通す）。これを超える明確な超過のみ rateOk=false。`;
  // マッチ設定の比重(C)・独自ルール(D)をプロンプトへ追記（既定のときは何も足さない）。
  const matchPrompt = `${withRate}${matchConfigPromptAddon(config)}`;
  return {
    matchPrompt,
    projectEmailPrompt: org?.projectEmailPrompt ?? null,
    rateToleranceMan,
    languageMatchAll,
    config,
  };
}

/**
 * 1案件 × 候補人材リストを LLM 判定し、MIN_SCORE 以上を Match に upsert。
 * candidates は呼び出し側で「同一企業除外」済みであること。
 * 事前フィルタ（必須スキルのカバー）で UNFIT を構造的に落としてからLLMへ渡す。
 */
async function rankAndSave(
  project: Project,
  candidates: Talent[],
  systemPrompt: string | undefined,
  rateToleranceMan: number,
  languageMatchAll: boolean,
  config: MatchConfig,
): Promise<{ pairs: number; saved: number }> {
  const shortlist = prefilterCandidates(
    project,
    candidates,
    SHORTLIST_LIMIT,
    rateToleranceMan,
    languageMatchAll,
    {
      rateGate: config.gates.rate,
      languageGate: config.gates.language,
      coverageGate: config.gates.coverage,
      minCoverage: config.minCoverage,
    },
  );
  if (shortlist.length === 0) return { pairs: 0, saved: 0 };

  const ranked = await getAI().rankCandidates(
    toProjectInput(project),
    shortlist.map((h) => toCandidateInput(h.talent)),
    systemPrompt,
  );

  let saved = 0;
  for (const r of ranked) {
    if (r.score < MIN_SCORE) continue;
    // 各ゲートが ON のときだけ LLM の除外フラグを尊重する（OFF＝点数で見るだけで除外しない）。
    // 勤務地・勤務形態（常駐/リモート/出社頻度）が両立しない場合はマッチを作らない（除外）。
    if (config.gates.location && r.locationOk === false) continue;
    // 年齢制限オーバーは常に除外。国籍/単価はゲートONのときのみ除外。
    if (r.ageOk === false) continue;
    if (config.gates.nationality && r.nationalityOk === false) continue;
    if (config.gates.rate && r.rateOk === false) continue;
    const reasons = [
      ...r.strengths,
      ...r.concerns.map((c) => `懸念: ${c}`),
    ];
    if (reasons.length === 0 && r.reason) reasons.push(r.reason);
    // 商流ゲートOFFなら提案不可フラグを立てない（点数のみで見る）。
    const proposable = !config.gates.channel || r.channelOk !== false;
    const channelNote = r.channelNote || null;
    // ここに到達＝勤務地・勤務形態は不一致でない（true か 不明）。OKラベル用に保存。
    const locationOk = r.locationOk ?? null;
    await prisma.match.upsert({
      where: {
        talentId_projectId: { talentId: r.talentId, projectId: project.id },
      },
      create: {
        talentId: r.talentId,
        projectId: project.id,
        score: r.score,
        reasons,
        proposable,
        channelNote,
        locationOk,
      },
      update: { score: r.score, reasons, proposable, channelNote, locationOk },
    });
    saved++;
  }
  return { pairs: shortlist.length, saved };
}

export interface RematchPageResult {
  totalProjects: number; // 対象案件の総数（新規が絡む案件のみ・名寄せ後）
  processed: number; // ここまでに処理した案件数（= 次回 offset）
  done: boolean; // 全件処理が完了したか
  talents: number;
  pairs: number;
  saved: number;
  errors: number;
  minScore: number;
}

/** 指定案件群について既にMatchがあるペア(projectId#talentId)の集合。判定済みスキップ用。 */
async function loadExistingMatchPairs(projectIds: string[]): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const rows = await prisma.match.findMany({
    where: { projectId: { in: projectIds } },
    select: { projectId: true, talentId: true },
  });
  return new Set(rows.map((r) => `${r.projectId}#${r.talentId}`));
}

/**
 * 組織内の全案件を LLM マッチング（手動「全件マッチ」/ rematch クロン用）。
 * offset/limit で案件を分割処理できる（1リクエストの時間を短く保ちタイムアウトを防ぐ）。
 * offset=0 のときだけクリーン再生成（既存マッチを全削除）する。
 */
export async function runMatchingForOrg(
  orgId: string,
  opts: {
    offset?: number;
    limit?: number;
    // all=自社+他社 / inhouse=自社のみ / registered=自社登録案件(REGISTER)×直近人材（手動の自社案件マッチ）
    scope?: "all" | "inhouse" | "registered";
    sinceDays?: number; // 対象とする配信日の幅（1=今日のみ。例 3=今日含む直近3日）
    // 判定済みペア（既にMatchがある）をLLMに再判定させない（コスト削減）。定時の日次rematchで有効化。
    // 手動フル再マッチ（プロンプト変更の反映やり直し等）は false で全件再評価する。
    skipExisting?: boolean;
    // 「新規」境界を明示指定（マッチのウォーターマーク）。前回rematch以降に取り込んだ分だけを
    // 新規として判定させる。未指定なら従来どおり today/sinceDays から算出（手動フル再マッチ用）。
    newSince?: Date;
  } = {},
): Promise<RematchPageResult> {
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = opts.limit && opts.limit > 0 ? opts.limit : Number.MAX_SAFE_INTEGER;
  const inhouseOnly = opts.scope === "inhouse";
  // registered: 自社登録案件(dataFrom=REGISTER)を、取込日に関係なく全件、直近の人材と突き合わせる。
  const registeredOnly = opts.scope === "registered";
  // 「新規」境界(createdAt)。既定は今日(JST)取込分。sinceDays>1 で過去に遡る（復旧用）。
  // 窓の基準は createdAt(取込日)。配信日(receivedDate)はバックログ取込で過去日付になり
  // 当日取込でも窓から外れるため使わない。
  const sinceDays = opts.sinceDays && opts.sinceDays > 0 ? opts.sinceDays : 1;
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = startOfTodayJst();
  // ウォーターマーク指定（定時の増分マッチ）があればそれを新規境界に。無ければ today/sinceDays。
  const newSince =
    opts.newSince ??
    (sinceDays <= 1 ? todayStart : new Date(todayStart.getTime() - (sinceDays - 1) * dayMs));
  // 候補プールの窓: 新規境界からさらに MATCH_WINDOW_DAYS 日前まで取り込んだ分。
  // これで「新規案件 × 直近N日の人材」「新規人材 × 直近N日の案件」を両立できる。
  // 自社人材(INHOUSE)は取込日に関係なく常にプールに含む。
  const poolSince = new Date(newSince.getTime() - MATCH_WINDOW_DAYS * dayMs);

  // inhouse スコープでは候補を自社保有人材だけに限定する。
  const talentWhere = inhouseOnly
    ? { orgId, talentType: "INHOUSE" as const }
    : talentWindowWhere(orgId, poolSince);

  const [projectsRaw, talents, prompts, ngDomains] = await Promise.all([
    // registered は自社登録案件(REGISTER)を全件。それ以外はプール窓(createdAt)の案件。作成日昇順で安定ページング。
    prisma.project.findMany({
      where: registeredOnly
        ? { orgId, dataFrom: "REGISTER" as const }
        : { orgId, createdAt: { gte: poolSince } },
      orderBy: { createdAt: "asc" },
      select: PROJECT_MATCH_SELECT,
    }) as unknown as Promise<Project[]>,
    prisma.talent.findMany({
      where: talentWhere,
      select: TALENT_MATCH_SELECT,
    }) as unknown as Promise<Talent[]>,
    resolveOrgPrompts(orgId),
    loadNgDomains(orgId),
  ]);
  const systemPrompt = prompts.matchPrompt;
  const rateToleranceMan = prompts.rateToleranceMan;
  const languageMatchAll = prompts.languageMatchAll;
  const config = prompts.config;

  // 同じ会社×件名の重複案件は、単価が高く商流が浅い方だけを代表に名寄せ（マッチ採用）。
  // 「貴社社員/貴社まで」案件は除外せず残し、候補を自社人材だけに絞る（下で対応）。
  const projectsPool = dedupeProjectsForMatch(projectsRaw);

  // 「新規」= newSince 以降に取り込んだもの。新規が絡むペアだけを対象にする:
  //  ・新規案件 → プール内の全人材を候補（新規案件 × 直近N日の人材）。
  //  ・既存案件(プール内) → 新規人材のみを候補（直近N日の案件 × 新規人材）。
  // どちらも新規でないペア（既存案件 × 既存人材）は再判定しない（過去に判定済み）。
  const newTalentIds = new Set(
    talents.filter((t) => t.createdAt >= newSince).map((t) => t.id),
  );
  // registered は「自社登録案件すべて × 直近のプール人材すべて」を対象にする（新規差分ロジックは使わない）。
  const targets = registeredOnly
    ? projectsPool
        .map((project) => ({ project, projectIsNew: true, pool: talents }))
        .filter(({ pool }) => pool.length > 0)
    : projectsPool
        .map((project) => {
          const projectIsNew = project.createdAt >= newSince;
          const pool = projectIsNew
            ? talents
            : talents.filter((t) => newTalentIds.has(t.id));
          return { project, projectIsNew, pool };
        })
        .filter(({ pool }) => pool.length > 0)
        // 新規案件を先に処理する（最も関連が高く、ページング途中で打ち切られても優先的に判定済みになる）。
        .sort((a, b) => Number(b.projectIsNew) - Number(a.projectIsNew));

  // マッチは「追記(upsert)のみ」。再実行で既存マッチを削除しない。
  // 理由: マッチには手動の営業パイプライン状態(stTalent/stAccept/stClient/stInterview/
  // stClosed)や差し戻し(rejectedAt)が保存される。削除して作り直すとレビュー中・対応中の
  // マッチが消え、手動入力も失われる（差し戻しも復活する）。1日に複数回（取込完了ごと）
  // 走るため、削除→再生成は実害が大きい。よって新しい候補ペアを足すだけにする。
  // rankAndSave の upsert は update でパイプライン/差し戻し列に触れないので状態は保持される。
  const slice = targets.slice(offset, offset + limit);

  // 判定済みペア（既にMatchあり）を再判定しない（コスト削減）。定時rematchで有効化。
  // これで取込時の差分マッチ(runMatchingForNew)が既に判定したペアを日次rematchが再判定する無駄を省く。
  const existingPairs = opts.skipExisting
    ? await loadExistingMatchPairs(slice.map((s) => s.project.id))
    : new Set<string>();

  // 案件を並列処理（実APIコールは matchLimiter で同時実行数が抑えられる）。
  const settled = await Promise.allSettled(
    slice.map(async ({ project, pool }) => {
      const candidates = buildCandidates(
        pool.filter(
          (t) => !isSameCompany(t, project) && !existingPairs.has(`${project.id}#${t.id}`),
        ),
        project,
        ngDomains,
        config.gates,
      );
      const r = await rankAndSave(
        project,
        candidates,
        systemPrompt,
        rateToleranceMan,
        languageMatchAll,
        config,
      );
      return { projectId: project.id, ...r };
    }),
  );

  let saved = 0;
  let pairs = 0;
  let errors = 0;
  const matchedProjectIds: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      pairs += s.value.pairs;
      saved += s.value.saved;
      if (s.value.saved > 0) matchedProjectIds.push(s.value.projectId);
    } else {
      errors++;
      console.error("[match] 案件のLLM判定に失敗:", s.reason);
    }
  }

  // マッチした案件の案内メール本文を先に整形してキャッシュ（見比べ「メール送信」タブを即表示にする）。
  await pregenerateProjectBodies({
    orgId,
    projectIds: matchedProjectIds,
    projectEmailPrompt: prompts.projectEmailPrompt,
  }).catch((e) => console.error("[match] メール本文の事前生成に失敗:", e));

  const processed = Math.min(offset + slice.length, targets.length);
  return {
    totalProjects: targets.length,
    processed,
    done: processed >= targets.length,
    talents: talents.length,
    pairs,
    saved,
    errors,
    minScore: MIN_SCORE,
  };
}

/**
 * 取込直後の差分マッチング。
 * - 新規案件は全人材を候補に判定（LLM 1回/案件）。
 * - 既存案件は「今回の新規人材」だけを候補に判定（新規人材が事前フィルタを通る案件のみLLM呼び出し）。
 * これにより、新規が一切絡まない既存×既存は再計算せず、LLM呼び出しを案件数以内に抑える。
 */
export async function runMatchingForNew(
  orgId: string,
  newTalentIds: string[],
  newProjectIds: string[],
): Promise<MatchRunResult> {
  if (newTalentIds.length === 0 && newProjectIds.length === 0) {
    return {
      projects: 0,
      talents: 0,
      pairs: 0,
      saved: 0,
      errors: 0,
      minScore: MIN_SCORE,
    };
  }

  const since = windowStart();
  const [projectsRaw, talents, prompts, ngDomains] = await Promise.all([
    prisma.project.findMany({
      // 取込日(createdAt)基準。配信日(receivedDate)だと古いメール取込が窓外になる。
      where: { orgId, createdAt: { gte: since } },
      select: PROJECT_MATCH_SELECT,
    }) as unknown as Promise<Project[]>,
    prisma.talent.findMany({
      where: talentWindowWhere(orgId, since),
      select: TALENT_MATCH_SELECT,
    }) as unknown as Promise<Talent[]>,
    resolveOrgPrompts(orgId),
    loadNgDomains(orgId),
  ]);
  const systemPrompt = prompts.matchPrompt;
  const rateToleranceMan = prompts.rateToleranceMan;
  const languageMatchAll = prompts.languageMatchAll;
  const config = prompts.config;

  // 同じ会社×件名の重複案件は、単価が高く商流が浅い方だけを代表に名寄せ（マッチ採用）。
  const projects = dedupeProjectsForMatch(projectsRaw);

  const isNewProject = new Set(newProjectIds);
  const isNewTalent = new Set(newTalentIds);

  // 新規が絡む案件だけを対象に並列マッチ（実APIコールは matchLimiter で抑制）。
  const targets = projects
    .map((project) => {
      // 新規案件→全人材、既存案件→新規人材のみ を候補に。
      const pool = isNewProject.has(project.id)
        ? talents
        : talents.filter((t) => isNewTalent.has(t.id));
      return { project, pool };
    })
    .filter(({ pool }) => pool.length > 0);

  // 判定済みペア（既にMatchあり）は再判定しない（取込差分マッチの再実行・重複起動でも無駄打ちしない）。
  const existingPairs = await loadExistingMatchPairs(targets.map((t) => t.project.id));

  const settled = await Promise.allSettled(
    targets.map(async ({ project, pool }) => {
      const candidates = buildCandidates(
        pool.filter(
          (t) => !isSameCompany(t, project) && !existingPairs.has(`${project.id}#${t.id}`),
        ),
        project,
        ngDomains,
        config.gates,
      );
      const r = await rankAndSave(
        project,
        candidates,
        systemPrompt,
        rateToleranceMan,
        languageMatchAll,
        config,
      );
      return { projectId: project.id, ...r };
    }),
  );

  let saved = 0;
  let pairs = 0;
  let errors = 0;
  const matchedProjectIds: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      pairs += s.value.pairs;
      saved += s.value.saved;
      if (s.value.saved > 0) matchedProjectIds.push(s.value.projectId);
    } else {
      errors++;
      console.error("[match] 案件のLLM判定に失敗:", s.reason);
    }
  }

  // マッチした案件の案内メール本文を先に整形してキャッシュ（見比べ「メール送信」タブを即表示にする）。
  await pregenerateProjectBodies({
    orgId,
    projectIds: matchedProjectIds,
    projectEmailPrompt: prompts.projectEmailPrompt,
  }).catch((e) => console.error("[match] メール本文の事前生成に失敗:", e));

  return {
    projects: projects.length,
    talents: talents.length,
    pairs,
    saved,
    errors,
    minScore: MIN_SCORE,
  };
}

/**
 * 人材起点の手動マッチ。指定した人材1名（自社保有/他社どちらも）を、取込窓に関係なく
 * 組織の全案件（名寄せ後）と突き合わせる。runMatchingForNew と違い人材をIDで明示ロードするため、
 * 古い他社人材でも確実に対象になる。判定済みペアはスキップ（再実行で二重判定しない）。
 */
export async function runMatchingForTalent(
  orgId: string,
  talentId: string,
): Promise<MatchRunResult> {
  const [talent, projectsRaw, prompts, ngDomains] = await Promise.all([
    prisma.talent.findFirst({
      where: { id: talentId, orgId },
      select: TALENT_MATCH_SELECT,
    }) as unknown as Promise<Talent | null>,
    prisma.project.findMany({
      where: { orgId },
      select: PROJECT_MATCH_SELECT,
    }) as unknown as Promise<Project[]>,
    resolveOrgPrompts(orgId),
    loadNgDomains(orgId),
  ]);
  if (!talent) {
    return { projects: 0, talents: 0, pairs: 0, saved: 0, errors: 0, minScore: MIN_SCORE };
  }
  const { matchPrompt: systemPrompt, rateToleranceMan, languageMatchAll, config } = prompts;

  const projects = dedupeProjectsForMatch(projectsRaw);
  const existingPairs = await loadExistingMatchPairs(projects.map((p) => p.id));

  const settled = await Promise.allSettled(
    projects.map(async (project) => {
      // 同一企業・判定済みペアを除いた上で、この人材だけを候補にゲート適用。
      const pool =
        isSameCompany(talent, project) || existingPairs.has(`${project.id}#${talent.id}`)
          ? []
          : [talent];
      const candidates = buildCandidates(pool, project, ngDomains, config.gates);
      const r = await rankAndSave(
        project,
        candidates,
        systemPrompt,
        rateToleranceMan,
        languageMatchAll,
        config,
      );
      return { projectId: project.id, ...r };
    }),
  );

  let saved = 0;
  let pairs = 0;
  let errors = 0;
  const matchedProjectIds: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      pairs += s.value.pairs;
      saved += s.value.saved;
      if (s.value.saved > 0) matchedProjectIds.push(s.value.projectId);
    } else {
      errors++;
      console.error("[match] 人材起点マッチの案件判定に失敗:", s.reason);
    }
  }

  await pregenerateProjectBodies({
    orgId,
    projectIds: matchedProjectIds,
    projectEmailPrompt: prompts.projectEmailPrompt,
  }).catch((e) => console.error("[match] メール本文の事前生成に失敗:", e));

  return { projects: projects.length, talents: 1, pairs, saved, errors, minScore: MIN_SCORE };
}
