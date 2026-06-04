import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // reset (idempotent dev seed)
  await prisma.match.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.talent.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "OBFall株式会社", slug: "obfall" },
  });

  const [yoshioka, katono, sato, nakano] = await Promise.all([
    prisma.user.create({
      data: { orgId: org.id, name: "吉岡", email: "t.yoshioka@obfall.co.jp", role: "ADMIN" },
    }),
    prisma.user.create({
      data: { orgId: org.id, name: "上遠野博紀", email: "katono@obfall.co.jp", role: "MEMBER" },
    }),
    prisma.user.create({
      data: { orgId: org.id, name: "佐藤しおり", email: "sato@obfall.co.jp", role: "MEMBER" },
    }),
    prisma.user.create({
      data: { orgId: org.id, name: "中野莉歩", email: "nakano@obfall.co.jp", role: "MEMBER" },
    }),
  ]);

  // --- In-house talents (mirrors the observed list) ---
  await prisma.talent.create({
    data: {
      orgId: org.id,
      managementId: "TS-001",
      talentType: "INHOUSE",
      dataFrom: "REGISTER",
      status: "PROPOSING",
      assigneeId: yoshioka.id,
      name: "T.S",
      age: 35,
      gender: "MALE",
      affiliation: "弊社個人事業主",
      employmentType: "FREELANCE",
      nationality: "JAPAN",
      japaneseLevel: "NATIVE",
      englishLevel: "DAILY",
      availabilityText: "7月〜",
      remotePreference: "MOSTLY_REMOTE",
      nearestStation: "間々田",
      mainSkills: ["AWS", "PHP", "Amazon Aurora"],
      skills: ["AWS", "PHP", "Amazon Aurora", "Laravel", "MySQL", "Docker"],
      qualifications: ["AWS認定SAA"],
      tags: ["インフラ", "バックエンド"],
    },
  });

  await prisma.talent.create({
    data: {
      orgId: org.id,
      managementId: "TW-002",
      talentType: "INHOUSE",
      dataFrom: "REGISTER",
      status: "ACTIVE",
      assigneeId: katono.id,
      name: "T.W",
      age: 39,
      gender: "MALE",
      affiliation: "弊社個人事業主",
      employmentType: "FREELANCE",
      nationality: "JAPAN",
      japaneseLevel: "NATIVE",
      englishLevel: "BUSINESS",
      availabilityText: "即日or6月〜",
      desiredRateMin: 80,
      remotePreference: "FULL_REMOTE",
      nearestStation: "常盤平",
      mainSkills: ["Go", "Node.js", "Python"],
      skills: ["Go", "Node.js", "Python", "TypeScript", "React", "GCP", "Kubernetes"],
      qualifications: [],
      tags: ["バックエンド", "SRE"],
    },
  });

  await prisma.talent.create({
    data: {
      orgId: org.id,
      managementId: "YK-003",
      talentType: "INHOUSE",
      dataFrom: "REGISTER",
      status: "PROPOSING",
      assigneeId: sato.id,
      name: "Y.K",
      age: 55,
      gender: "MALE",
      affiliation: "弊社個人事業主",
      employmentType: "FREELANCE",
      nationality: "JAPAN",
      japaneseLevel: "NATIVE",
      englishLevel: "DAILY",
      availabilityText: "4月〜",
      desiredRateMin: 85,
      remotePreference: "HYBRID",
      nearestStation: "白楽",
      mainSkills: ["SAP", "SAP S/4HANA", "ERP"],
      skills: ["SAP", "SAP S/4HANA", "ERP", "ABAP"],
      qualifications: ["SAP認定コンサルタント"],
      tags: ["SAP", "コンサル"],
    },
  });

  // a few extra to make search meaningful
  await prisma.talent.create({
    data: {
      orgId: org.id,
      managementId: "MK-004",
      talentType: "INHOUSE",
      dataFrom: "EMAIL",
      status: "NONE",
      assigneeId: nakano.id,
      name: "M.K",
      age: 29,
      gender: "FEMALE",
      affiliation: "弊社社員",
      employmentType: "EMPLOYEE",
      nationality: "JAPAN",
      japaneseLevel: "NATIVE",
      englishLevel: "BUSINESS",
      availabilityText: "即日",
      desiredRateMin: 65,
      remotePreference: "FULL_REMOTE",
      nearestStation: "大宮",
      emailSubject: "【ご紹介】フロントエンドエンジニア",
      mainSkills: ["React", "Next.js", "TypeScript"],
      skills: ["React", "Next.js", "TypeScript", "JavaScript", "Node.js"],
      tags: ["フロントエンド"],
    },
  });

  await prisma.talent.create({
    data: {
      orgId: org.id,
      managementId: "RT-005",
      talentType: "PARTNER",
      dataFrom: "EMAIL",
      status: "PROPOSING",
      name: "R.T",
      age: 42,
      gender: "MALE",
      affiliation: "協力会社A",
      employmentType: "FREELANCE",
      nationality: "JAPAN",
      japaneseLevel: "NATIVE",
      availabilityText: "8月〜",
      desiredRateMin: 70,
      desiredRateMax: 80,
      remotePreference: "OFFICE_2",
      nearestStation: "新宿",
      mainSkills: ["Java", "Spring"],
      skills: ["Java", "Spring", "Oracle", "AWS"],
      tags: ["バックエンド"],
    },
  });

  // --- Projects (案件) ---
  await prisma.project.create({
    data: {
      orgId: org.id,
      managementId: "PJ-001",
      title: "大手ECサイト バックエンド改修",
      clientName: "エンドA社",
      businessFlow: "弊社→元請けB社→エンドA社",
      status: "OPEN",
      dataFrom: "REGISTER",
      assigneeId: yoshioka.id,
      description: "PHP/Laravelによる既存ECのバックエンド改修。AWS環境。",
      requiredSkills: ["PHP", "AWS", "MySQL"],
      tags: ["バックエンド"],
      rateMin: 70,
      rateMax: 90,
      remotePreference: "MOSTLY_REMOTE",
      location: "東京都港区",
      nearestStation: "品川",
      startText: "7月〜",
    },
  });

  await prisma.project.create({
    data: {
      orgId: org.id,
      managementId: "PJ-002",
      title: "SaaSプロダクト SRE",
      clientName: "エンドC社",
      businessFlow: "弊社→エンドC社",
      status: "OPEN",
      dataFrom: "EMAIL",
      assigneeId: katono.id,
      description: "Go/Kubernetes基盤のSaaSのSRE。フルリモート可。",
      requiredSkills: ["Go", "Kubernetes", "GCP"],
      tags: ["SRE"],
      rateMin: 80,
      rateMax: 100,
      remotePreference: "FULL_REMOTE",
      location: "フルリモート",
      startText: "即日〜",
    },
  });

  await prisma.project.create({
    data: {
      orgId: org.id,
      managementId: "PJ-003",
      title: "製造業向けSAP S/4HANA導入支援",
      clientName: "エンドD社",
      status: "PROPOSING",
      dataFrom: "REGISTER",
      assigneeId: sato.id,
      description: "SAP S/4HANA導入のコンサルティング。",
      requiredSkills: ["SAP", "SAP S/4HANA", "ERP"],
      tags: ["SAP"],
      rateMin: 90,
      rateMax: 120,
      remotePreference: "HYBRID",
      location: "神奈川県横浜市",
      nearestStation: "横浜",
      startText: "4月〜",
    },
  });

  console.log("Seed completed: org=%s, talents=5, projects=3", org.name);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
