import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { decodeCsv, parseBlastmailCsv, type BlastmailRow } from "@/lib/partners/csv";
import { companyDomain } from "@/lib/matching";

export const maxDuration = 60;

export interface ImportResult {
  totalRows: number;
  companiesCreated: number;
  contactsCreated: number;
  contactsUpdated: number;
  skippedInvalid: number;
  byStatus: { active: number; bounced: number; unsubscribed: number };
  errors: { line: number; reason: string }[];
}

/**
 * BLASTMAIL CSV を取り込み、提携先会社・連絡先を upsert する（冪等）。
 * - 会社は会社名でupsert（既存メタは壊さない）
 * - 連絡先はメールでupsert。既存が UNSUBSCRIBED ならCSVで上書きしない（本人の停止を尊重）
 */
export async function POST(req: NextRequest) {
  try {
    const org = await getCurrentOrg();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSVファイルを添付してください" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = decodeCsv(bytes);
    const { rows, errors } = parseBlastmailCsv(text);

    const result: ImportResult = {
      totalRows: rows.length,
      companiesCreated: 0,
      contactsCreated: 0,
      contactsUpdated: 0,
      skippedInvalid: errors.length,
      byStatus: { active: 0, bounced: 0, unsubscribed: 0 },
      errors: errors.slice(0, 50), // 多すぎる場合は先頭50件だけ返す
    };

    // 会社名→会社ID のキャッシュ（同一CSV内の重複会社で何度もDBを叩かない）。
    const companyIdByName = new Map<string, string>();

    // 既存連絡先の状態を一括取得（UNSUBSCRIBED保護のため）。
    const emails = [...new Set(rows.map((r) => r.email))];
    const existing = await prisma.partnerContact.findMany({
      where: { orgId: org.id, email: { in: emails } },
      select: { email: true, status: true },
    });
    const existingStatus = new Map(existing.map((e) => [e.email, e.status]));

    // チャンクで処理（825行規模でもトランザクションを小分けに）。
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await prisma.$transaction(async (tx) => {
        for (const row of chunk) {
          const companyId = await upsertCompany(tx, org.id, row, companyIdByName);
          const wasNew = !existingStatus.has(row.email);
          // 既存がUNSUBSCRIBEDなら状態を上書きしない（本人の停止を尊重）。
          const keepUnsub = existingStatus.get(row.email) === "UNSUBSCRIBED";
          const status = keepUnsub ? "UNSUBSCRIBED" : row.status;

          await tx.partnerContact.upsert({
            where: { orgId_email: { orgId: org.id, email: row.email } },
            create: {
              orgId: org.id,
              companyId,
              email: row.email,
              name: row.name,
              status,
              bounceCount: row.errorCount,
            },
            update: {
              companyId,
              name: row.name ?? undefined,
              status,
              bounceCount: row.errorCount,
            },
          });

          if (wasNew) result.contactsCreated++;
          else result.contactsUpdated++;
          if (status === "ACTIVE") result.byStatus.active++;
          else if (status === "BOUNCED") result.byStatus.bounced++;
          else result.byStatus.unsubscribed++;
        }
      });
    }

    result.companiesCreated = [...companyIdByName.keys()].length; // 当CSVで触れた会社数の目安
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/partners/import]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function upsertCompany(
  tx: Tx,
  orgId: string,
  row: BlastmailRow,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(row.company);
  if (cached) return cached;
  const domain = companyDomain(row.email);
  const company = await tx.partnerCompany.upsert({
    where: { orgId_name: { orgId, name: row.company } },
    create: { orgId, name: row.company, domain },
    update: domain ? { domain } : {},
    select: { id: true },
  });
  cache.set(row.company, company.id);
  return company.id;
}
