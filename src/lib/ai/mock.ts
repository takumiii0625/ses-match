import type {
  AIService,
  ParsedTalent,
  ParsedProject,
  ProposalInput,
  EmailClassification,
  MatchProjectInput,
  MatchCandidateInput,
  RankedCandidate,
  MatchRecommendation,
  ParsedSkillSheet,
} from "./types";
import { expandSkills } from "@/lib/matching";

// Heuristic, dependency-free stand-in for a real LLM. Good enough to demo the
// full email→data→proposal flow without any API key. Replace with a real
// provider by implementing AIService and wiring it in ./index.ts.

const SKILL_DICT = [
  "Java", "Kotlin", "Scala", "Go", "Rust", "Python", "Ruby", "PHP", "Perl",
  "JavaScript", "TypeScript", "Node.js", "React", "Next.js", "Vue", "Angular",
  "C#", ".NET", "C++", "C", "Swift", "Objective-C", "Flutter", "Dart",
  "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform",
  "MySQL", "PostgreSQL", "Oracle", "Amazon Aurora", "MongoDB", "Redis",
  "SAP", "SAP S/4HANA", "ERP", "Salesforce", "Spring", "Laravel", "Django",
];

function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const s of SKILL_DICT) {
    const re = new RegExp(`(?<![A-Za-z])${s.replace(/[.+*?^${}()|[\]\\]/g, "\\$&")}`, "i");
    if (re.test(text)) found.add(s);
  }
  return [...found];
}

function extractRate(text: string): { min?: number; max?: number } {
  // matches "80万", "60〜80万", "単価80"
  const range = text.match(/(\d{2,3})\s*[〜~\-]\s*(\d{2,3})\s*万/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/(\d{2,3})\s*万/);
  if (single) return { min: Number(single[1]) };
  return {};
}

function extractRemote(text: string): string | undefined {
  if (/フルリモート/.test(text)) return "FULL_REMOTE";
  if (/基本リモート/.test(text)) return "MOSTLY_REMOTE";
  if (/ハイブリッド/.test(text)) return "HYBRID";
  if (/常駐/.test(text)) return "ONSITE";
  if (/リモート/.test(text)) return "MOSTLY_REMOTE";
  return undefined;
}

function extractAge(text: string): number | undefined {
  const m = text.match(/(\d{2})\s*歳/);
  return m ? Number(m[1]) : undefined;
}

function extractStart(text: string): string | undefined {
  const m = text.match(/(即日|\d{1,2}\s*月\s*[〜~]?|[〜~]?\s*\d{1,2}\s*月)[^\n。、]*/);
  return m ? m[0].trim() : undefined;
}

export class MockAIService implements AIService {
  async classifyEmail(rawEmail: string): Promise<EmailClassification> {
    const text = rawEmail;
    const projectHints = /(案件|募集|求人|エンド|商流|参画|稼働場所|ポジション)/;
    const talentHints = /(人材|要員|エンジニア|ご紹介|経歴|スキルシート|稼働可能|提案できる)/;
    const p = projectHints.test(text);
    const t = talentHints.test(text);
    if (t && !p) return { kind: "TALENT", reason: "人材系キーワードを検出" };
    if (p && !t) return { kind: "PROJECT", reason: "案件系キーワードを検出" };
    if (t && p) return { kind: "TALENT", reason: "両方検出（人材優先）" };
    return { kind: "IGNORE", reason: "人材・案件いずれのキーワードも未検出" };
  }

  async parseTalentEmail(rawEmail: string): Promise<ParsedTalent> {
    const skills = extractSkills(rawEmail);
    const rate = extractRate(rawEmail);
    const nameM = rawEmail.match(/(?:氏名|名前|お名前)[:：]?\s*([^\s\n、。]+)/);
    const stationM = rawEmail.match(/(?:最寄|最寄り駅)[:：]?\s*([^\s\n、。]+)/);
    const affM =
      rawEmail.match(/(?:所属|商流)[:：]?\s*([^\s\n、。]+)/) ??
      rawEmail.match(/(\d+社先(?:社員)?|プロパー|個人事業主|フリーランス)/);
    return {
      name: nameM?.[1],
      age: extractAge(rawEmail),
      skills,
      mainSkills: skills.slice(0, 3),
      desiredRateMin: rate.min,
      desiredRateMax: rate.max,
      remotePreference: extractRemote(rawEmail),
      availabilityText: extractStart(rawEmail),
      nearestStation: stationM?.[1],
      affiliation: affM?.[1] ?? affM?.[0],
      note: rawEmail.slice(0, 400),
    };
  }

  async parseProjectEmail(rawEmail: string): Promise<ParsedProject> {
    const skills = extractSkills(rawEmail);
    const rate = extractRate(rawEmail);
    const titleM = rawEmail.match(/(?:案件名|件名|タイトル)[:：]?\s*([^\n]+)/);
    const clientM = rawEmail.match(/(?:エンド|顧客|クライアント|商流)[:：]?\s*([^\n、。]+)/);
    const locM = rawEmail.match(/(?:勤務地|場所|エリア)[:：]?\s*([^\n、。]+)/);
    return {
      title: titleM?.[1]?.trim() ?? rawEmail.split("\n")[0]?.slice(0, 60),
      clientName: clientM?.[1]?.trim(),
      requiredSkills: skills,
      rateMin: rate.min,
      rateMax: rate.max,
      remotePreference: extractRemote(rawEmail),
      location: locM?.[1]?.trim(),
      startText: extractStart(rawEmail),
      description: rawEmail.slice(0, 600),
      channelText:
        rawEmail.match(/(?:商流|エンド直|プロパー)[^\n。、]{0,20}/)?.[0]?.trim() ?? undefined,
      supportFee: /支援費|営業支援費|中抜き/.test(rawEmail),
    };
  }

  async parseSkillSheet(rawText: string): Promise<ParsedSkillSheet> {
    const t = await this.parseTalentEmail(rawText);
    const initial = (t.name ?? "").trim().slice(0, 1) || "〇";
    const summary = [
      `【ID】 ${initial}.`,
      `【年齢】 ${t.age ?? "-"}歳`,
      `【性別】 -`,
      `【所属】 -`,
      `【住まい】 ${t.nearestStation ?? "-"}`,
      `【稼働形態】 ${t.remotePreference ?? "-"}`,
      `【稼働開始日】 ${t.availabilityText ?? "-"}`,
      `【経験年数】 -`,
      `【希望単価(税抜)】 ${t.desiredRateMin ?? "-"}万（税抜）`,
      `【経験スキル】`,
      `・言語/FW: ${(t.skills ?? []).join("、") || "-"}`,
      `【経歴要約】 ${(t.note ?? "").slice(0, 120) || "-"}`,
    ].join("\n");
    return { ...t, summary };
  }

  async improveSkillSheet(currentText: string): Promise<string> {
    // モックは整形のみ（前後空白の除去・連続空行の圧縮）。
    return currentText
      .split("\n")
      .map((l) => l.replace(/\s+$/u, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async generateProposal(input: ProposalInput): Promise<string> {
    const reasons = (input.matchReasons ?? []).map((r) => `・${r}`).join("\n");
    return [
      `${input.projectClient ?? "ご担当者"}様`,
      ``,
      `お世話になっております。`,
      `標題の「${input.projectTitle}」につきまして、弊社所属の${input.talentName}をご提案申し上げます。`,
      ``,
      `【ご提案要員】`,
      `氏名（イニシャル）: ${input.talentName}`,
      `スキル: ${input.talentSkills.join(" / ")}`,
      input.talentRate ? `希望単価: ${input.talentRate}` : ``,
      ``,
      reasons ? `【マッチング根拠】\n${reasons}` : ``,
      ``,
      `ご検討のほど、よろしくお願いいたします。`,
    ]
      .filter((l) => l !== ``)
      .join("\n");
  }

  async rankCandidates(
    project: MatchProjectInput,
    candidates: MatchCandidateInput[],
    // systemPrompt はモックでは未使用（ヒューリスティック判定のため）。
    _systemPrompt?: string,
  ): Promise<RankedCandidate[]> {
    const required = project.requiredSkills.map((s) => s.toLowerCase().trim());
    const ranked = candidates.map((c) => {
      const owned = expandSkills(c.skills);
      const hits = required.filter((r) => owned.has(r));
      const coverage = required.length ? hits.length / required.length : 0.5;
      const rateOk =
        project.rateMax == null ||
        c.desiredRateMin == null ||
        c.desiredRateMin <= project.rateMax;
      let score = Math.round(coverage * 70 + (rateOk ? 20 : 0) + 10);
      if (required.length && hits.length === 0) score = Math.min(score, 15);

      let recommendation: MatchRecommendation = "UNFIT";
      if (score >= 75) recommendation = "STRONG";
      else if (score >= 50) recommendation = "POSSIBLE";
      else if (score >= 25) recommendation = "WEAK";

      const strengths: string[] = [];
      const concerns: string[] = [];
      if (hits.length)
        strengths.push(`スキル一致: ${hits.join(", ")}（${Math.round(coverage * 100)}%）`);
      else if (required.length) concerns.push("必須スキルの一致なし");
      if (!rateOk) concerns.push("希望単価が案件上限を超過");

      // モックは商流を厳密判定しない。支援費があれば可、エンド直/プロパーのみは不可とする簡易判定。
      const channel = (project.channelText ?? "").toLowerCase();
      const strict = /エンド直|プロパー|直のみ/.test(project.channelText ?? "");
      const channelOk = project.supportFee ? true : !strict;
      const channelNote = project.supportFee
        ? "支援費の記載あり（商流可とみなす）"
        : strict
          ? `商流制限「${project.channelText}」のため弊社が入ると提案不可`
          : channel
            ? `商流「${project.channelText}」要確認`
            : "商流条件は要確認";

      return {
        talentId: c.talentId,
        score,
        recommendation,
        strengths,
        concerns,
        reason: hits.length
          ? `必須スキル ${hits.length}/${required.length} 件一致`
          : "必須スキルの一致が見られない",
        channelOk,
        channelNote,
      };
    });
    return ranked.sort((a, b) => b.score - a.score);
  }
}
