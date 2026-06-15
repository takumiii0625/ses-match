import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { decodeCsv, parseBlastmailCsv } from "@/lib/partners/csv";
import { companyDomain } from "@/lib/matching";
import { mapLimit } from "@/lib/limit";
import type { PartnerContactStatus } from "@prisma/client";

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

// 控えめな並行度（Neon接続枯渇の教訓。各upsertは短文なので5でも60秒内に収まる）。
const CONCURRENCY = 5;

/**
 * BLASTMAIL CSV を取り込み、提携先会社・連絡先を upsert する（冪等）。
 * 注意: Neonのプーラ(PgBouncer)では大きな対話的トランザクションが切れるため、
 * $transaction は使わず、個別upsert（各文がアトミック）を並行実行する。
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
      errors: errors.slice(0, 50),
    };

    // --- 1) 会社を一意化してupsert（会社名→id マップを作る）。 ---
    const uniqueCompanies = new Map<string, string | null>(); // name -> domain
    for (const r of rows) {
      if (!uniqueCompanies.has(r.company)) uniqueCompanies.set(r.company, companyDomain(r.email));
    }
    const companyIdByName = new Map<string, string>();
    await mapLimit([...uniqueCompanies], CONCURRENCY, async ([name, domain]) => {
      const c = await prisma.partnerCompany.upsert({
        where: { orgId_name: { orgId: org.id, name } },
        create: { orgId: org.id, name, domain },
        update: domain ? { domain } : {},
        select: { id: true },
      });
      companyIdByName.set(name, c.id);
    });
    result.companiesCreated = uniqueCompanies.size; // 当CSVで触れた会社数

    // --- 2) メールで重複行を排除（同一メール=同一連絡先）。 ---
    const byEmail = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!byEmail.has(r.email)) byEmail.set(r.email, r);
    const contactRows = [...byEmail.values()];

    // 既存連絡先の状態を一括取得（UNSUBSCRIBED保護）。emailは数百〜千件なのでチャンク照会。
    const emails = contactRows.map((r) => r.email);
    const existingStatus = new Map<string, PartnerContactStatus>();
    for (let i = 0; i < emails.length; i += 500) {
      const chunk = emails.slice(i, i + 500);
      const found = await prisma.partnerContact.findMany({
        where: { orgId: org.id, email: { in: chunk } },
        select: { email: true, status: true },
      });
      for (const f of found) existingStatus.set(f.email, f.status);
    }

    // --- 3) 連絡先を並行upsert。 ---
    await mapLimit(contactRows, CONCURRENCY, async (row) => {
      const companyId = companyIdByName.get(row.company);
      if (!companyId) return; // 会社upsertに失敗した場合のみ（通常起きない）
      const wasNew = !existingStatus.has(row.email);
      const keepUnsub = existingStatus.get(row.email) === "UNSUBSCRIBED";
      const status: PartnerContactStatus = keepUnsub ? "UNSUBSCRIBED" : row.status;

      await prisma.partnerContact.upsert({
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

      // カウンタ更新（同期処理なのでイベントループ上アトミック）。
      if (wasNew) result.contactsCreated++;
      else result.contactsUpdated++;
      if (status === "ACTIVE") result.byStatus.active++;
      else if (status === "BOUNCED") result.byStatus.bounced++;
      else result.byStatus.unsubscribed++;
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/partners/import]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
