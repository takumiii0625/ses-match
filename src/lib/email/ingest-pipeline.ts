import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { getAI } from "@/lib/ai";
import { fetchEmails } from "./gmail";
import type { RemotePreference } from "@prisma/client";

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
    items: [],
  };

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
      const cls = await ai.classifyEmail(raw, mail.attachments);
      let talentId: string | undefined;
      let projectId: string | undefined;

      if (cls.kind === "TALENT") {
        const p = await ai.parseTalentEmail(raw, mail.attachments);
        const t = await prisma.talent.create({
          data: {
            orgId: org.id,
            talentType: "PARTNER", // 受信メール経由＝他社人材として登録
            dataFrom: "EMAIL",
            name: p.name ?? mail.from ?? "（氏名不明）",
            age: p.age ?? null,
            skills: p.skills ?? [],
            mainSkills: p.mainSkills ?? [],
            desiredRateMin: p.desiredRateMin ?? null,
            desiredRateMax: p.desiredRateMax ?? null,
            remotePreference: toRemote(p.remotePreference),
            availabilityText: p.availabilityText ?? null,
            nearestStation: p.nearestStation ?? null,
            emailSubject: mail.subject ?? null,
            sourceEmail,
            note: p.note ?? mail.text.slice(0, 500),
            receivedDate: mail.date ?? new Date(),
          },
        });
        talentId = t.id;
        result.created.talent++;
      } else if (cls.kind === "PROJECT") {
        const p = await ai.parseProjectEmail(raw, mail.attachments);
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
            sourceEmail,
            description: p.description ?? mail.text.slice(0, 600),
            receivedDate: mail.date ?? new Date(),
          },
        });
        projectId = proj.id;
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

  return result;
}
