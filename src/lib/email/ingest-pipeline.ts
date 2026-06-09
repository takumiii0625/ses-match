import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { getAI } from "@/lib/ai";
import { fetchEmails } from "./gmail";
import { companyDomain } from "@/lib/matching";
import { runMatchingForNew } from "@/lib/match-run";
import type { RemotePreference } from "@prisma/client";

// 自社ドメイン。送信元がこのドメインなら自社保有人材(INHOUSE)、それ以外は他社(PARTNER)。
const OWN_DOMAIN = (process.env.COMPANY_DOMAIN ?? "obfall.co.jp").toLowerCase();

const REMOTE_VALUES = new Set<RemotePreference>([
  "FULL_REMOTE",
  "MOSTLY_REMOTE",
  "HYBRID",
  "OFFICE_1",
  "OFFICE_2",
  "OFFICE_3",
  "OFFICE_4",
  "ONSITE",
]);

function toRemote(v?: string): RemotePreference | null {
  return v && REMOTE_VALUES.has(v as RemotePreference)
    ? (v as RemotePreference)
    : null;
}

const GENDER_VALUES = new Set(["MALE", "FEMALE", "OTHER"]);
function toGender(v?: string): "MALE" | "FEMALE" | "OTHER" | null {
  return v && GENDER_VALUES.has(v) ? (v as "MALE" | "FEMALE" | "OTHER") : null;
}

/** Extract the bare email address from a From header ("名前 <a@b.com>" → a@b.com). */
function parseFromEmail(from?: string | null): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/) ?? from.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1].toLowerCase() : null;
}

export interface IngestRunResult {
  fetched: number;
  created: { talent: number; project: number };
  ignored: number;
  skipped: number;
  errors: number;
  // 取込で新規作成された人材・案件を対象に自動マッチした結果。
  matched: { pairs: number; saved: number };
  items: {
    subject?: string;
    from?: string;
    kind: string;
    reason?: string;
  }[];
}

/** Fetch new mail, classify with AI, and register talents/projects. */
export async function runMailIngest(limit = 20): Promise<IngestRunResult> {
  const org = await getCurrentOrg();
  const ai = getAI();
  const emails = await fetchEmails(limit);

  const result: IngestRunResult = {
    fetched: emails.length,
    created: { talent: 0, project: 0 },
    ignored: 0,
    skipped: 0,
    errors: 0,
    matched: { pairs: 0, saved: 0 },
    items: [],
  };

  // この取込で新規作成された人材・案件のID。取込後にこれらだけを自動マッチする。
  const newTalentIds: string[] = [];
  const newProjectIds: string[] = [];

  for (const mail of emails) {
    // dedup
    const existing = await prisma.ingestedEmail.findUnique({
      where: { messageId: mail.messageId },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    const raw = `件名: ${mail.subject ?? ""}\n差出人: ${mail.from ?? ""}\n\n${mail.text}`;
    const sourceEmail = parseFromEmail(mail.from);

    try {
      const cls = await ai.classifyEmail(
        raw,
        mail.attachments,
        org.classifyPrompt ?? undefined,
      );
      let talentId: string | undefined;
      let projectId: string | undefined;

      if (cls.kind === "TALENT") {
        const p = await ai.parseTalentEmail(
          raw,
          mail.attachments,
          org.talentPrompt ?? undefined,
        );
        // 送信元ドメインで自社/他社を自動判定
        const isOwn = companyDomain(sourceEmail) === OWN_DOMAIN;
        const t = await prisma.talent.create({
          data: {
            orgId: org.id,
            talentType: isOwn ? "INHOUSE" : "PARTNER",
            dataFrom: "EMAIL",
            name: p.name ?? mail.from ?? "（氏名不明）",
            age: p.age ?? null,
            gender: toGender(p.gender),
            skills: p.skills ?? [],
            mainSkills: p.mainSkills ?? [],
            desiredRateMin: p.desiredRateMin ?? null,
            desiredRateMax: p.desiredRateMax ?? null,
            remotePreference: toRemote(p.remotePreference),
            availabilityText: p.availabilityText ?? null,
            nearestStation: p.nearestStation ?? null,
            affiliation: p.affiliation ?? null,
            emailSubject: mail.subject ?? null,
            emailBody: mail.text || null,
            emailFrom: mail.from ?? null,
            emailTo: mail.to ?? null,
            sourceEmail,
            note: p.note ?? mail.text.slice(0, 500),
            receivedDate: mail.date ?? new Date(),
          },
        });
        talentId = t.id;
        newTalentIds.push(t.id);
        result.created.talent++;
      } else if (cls.kind === "PROJECT") {
        const p = await ai.parseProjectEmail(
          raw,
          mail.attachments,
          org.projectPrompt ?? undefined,
        );
        const proj = await prisma.project.create({
          data: {
            orgId: org.id,
            dataFrom: "EMAIL",
            title: p.title ?? mail.subject ?? "（件名なし）",
            clientName: p.clientName ?? null,
            requiredSkills: p.requiredSkills ?? [],
            rateMin: p.rateMin ?? null,
            rateMax: p.rateMax ?? null,
            remotePreference: toRemote(p.remotePreference),
            location: p.location ?? null,
            startText: p.startText ?? null,
            channelText: p.channelText ?? null,
            supportFee: p.supportFee ?? false,
            emailSubject: mail.subject ?? null,
            emailBody: mail.text || null,
            emailFrom: mail.from ?? null,
            emailTo: mail.to ?? null,
            sourceEmail,
            description: p.description ?? mail.text.slice(0, 600),
            receivedDate: mail.date ?? new Date(),
          },
        });
        projectId = proj.id;
        newProjectIds.push(proj.id);
        result.created.project++;
      } else {
        result.ignored++;
      }

      await prisma.ingestedEmail.create({
        data: {
          orgId: org.id,
          messageId: mail.messageId,
          gmailId: mail.gmailId,
          fromAddr: mail.from ?? null,
          subject: mail.subject ?? null,
          receivedAt: mail.date ?? null,
          kind: cls.kind,
          talentId,
          projectId,
          reason: cls.reason,
        },
      });

      result.items.push({
        subject: mail.subject,
        from: mail.from,
        kind: cls.kind,
        reason: cls.reason,
      });
    } catch (e) {
      result.errors++;
      const message = e instanceof Error ? e.message : String(e);
      await prisma.ingestedEmail
        .create({
          data: {
            orgId: org.id,
            messageId: mail.messageId,
            gmailId: mail.gmailId,
            fromAddr: mail.from ?? null,
            subject: mail.subject ?? null,
            receivedAt: mail.date ?? null,
            kind: "ERROR",
            reason: message.slice(0, 500),
          },
        })
        .catch(() => {});
      result.items.push({
        subject: mail.subject,
        from: mail.from,
        kind: "ERROR",
        reason: message,
      });
    }
  }

  // 取込で増えた人材・案件を、その場で既存データと突き合わせて自動マッチ。
  // ここが無いと、メールは取り込まれてもマッチが一切付かないままになる。
  try {
    const m = await runMatchingForNew(org.id, newTalentIds, newProjectIds);
    result.matched = { pairs: m.pairs, saved: m.saved };
  } catch (e) {
    // マッチングで落ちても取込結果は返す（マッチは rematch で後追いできる）。
    const message = e instanceof Error ? e.message : String(e);
    result.items.push({ kind: "MATCH_ERROR", reason: message });
  }

  return result;
}
