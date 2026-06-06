import "dotenv/config";
import { AnthropicAIService } from "../src/lib/ai/anthropic.ts";

const ai = new AnthropicAIService();

const project = {
  title: "ECサイト バックエンド改修",
  clientName: "エンドA社",
  requiredSkills: ["PHP", "Laravel", "MySQL"],
  rateMin: 70,
  rateMax: 90,
  remotePreference: "MOSTLY_REMOTE",
  location: "東京",
  startText: "即日〜",
  description: "PHP/LaravelによるECのバックエンド改修。",
};

const candidates = [
  {
    talentId: "php-guy",
    name: "P.H",
    age: 33,
    talentType: "PARTNER",
    skills: ["PHP", "Laravel", "MySQL", "AWS"],
    desiredRateMin: 75,
    remotePreference: "FULL_REMOTE",
    availabilityText: "即日",
    note: "PHP/Laravel歴7年、EC構築経験豊富",
  },
  {
    talentId: "java-guy",
    name: "J.A",
    age: 40,
    talentType: "PARTNER",
    skills: ["Java", "Spring Boot", "Oracle"],
    desiredRateMin: 80,
    remotePreference: "HYBRID",
    availabilityText: "来月〜",
    note: "Java一筋。PHP経験なし。",
  },
  {
    talentId: "fullstack",
    name: "F.S",
    age: 29,
    talentType: "INHOUSE",
    skills: ["PHP", "JavaScript", "React", "MySQL"],
    desiredRateMin: 65,
    remotePreference: "FULL_REMOTE",
    availabilityText: "即日",
    note: "PHPとフロント両方。Laravelは少し。",
  },
];

const results = await ai.rankCandidates(project, candidates);
for (const r of results) {
  const c = candidates.find((x) => x.talentId === r.talentId);
  console.log(
    `\n[${r.score}点 / ${r.recommendation}] ${c?.name} (${c?.skills.join("/")})`,
  );
  console.log("  根拠:", r.reason);
  if (r.strengths.length) console.log("  ✓", r.strengths.join(" / "));
  if (r.concerns.length) console.log("  ⚠", r.concerns.join(" / "));
}
