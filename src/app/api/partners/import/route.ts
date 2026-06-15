import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { decodeCsv, parseBlastmailCsv, type BlastmailRow } from "@/lib/partners/csv";
import { companyDomain } from "@/lib/matching";
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

const CHUNK = 500;

/**
 * BLASTMAIL CSV を取り込み、提携先会社・連絡先を一括登録する（冪等）。
 * 行数に依存しないよう createMany/updateMany の一括クエリで実装する。
 * （Neonプーラでは大量の個別往復はタイムアウトするため、対話的トランザクションも個別upsertも使わない）
 * - 会社は会社名でユニーク（createMany skipDuplicates）
 * - 連絡先はメールでユニーク。新規はcreateMany、既存はstatusをupdateMany。
 * - 既存が UNSUBSCRIBED の連絡先はCSVで上書きしない（本人の停止を尊重）
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

    // --- 1) 会社を一意化して一括作成。 ---
    const uniqueCompanies = new Map<string, string | null>(); // name -> domain
    for (const r of rows) {
      if (!uniqueCompanies.has(r.company)) uniqueCompanies.set(r.company, companyDomain(r.email));
    }
    const companyCreate = await prisma.partnerCompany.createMany({
      data: [...uniqueCompanies].map(([name, domain]) => ({ orgId: org.id, name, domain })),
      skipDuplicates: true,
    });

    // 会社名→id マップ（新規・既存ともに引く）。
    const names = [...uniqueCompanies.keys()];
    const companyIdByName = new Map<string, string>();
    for (let i = 0; i < names.length; i += CHUNK) {
      const found = await prisma.partnerCompany.findMany({
        where: { orgId: org.id, name: { in: names.slice(i, i + CHUNK) } },
        select: { id: true, name: true },
      });
      for (const c of found) companyIdByName.set(c.name, c.id);
    }

    // --- 2) 連絡先をメールで一意化。 ---
    const byEmail = new Map<string, BlastmailRow>();
    for (const r of rows) if (!byEmail.has(r.email)) byEmail.set(r.email, r);
    const contactRows = [...byEmail.values()];

    // 既存連絡先の状態を一括取得（新規/既存の振り分け・UNSUBSCRIBED保護）。
    const emails = contactRows.map((r) => r.email);
    const existingStatus = new Map<string, PartnerContactStatus>();
    for (let i = 0; i < emails.length; i += CHUNK) {
      const found = await prisma.partnerContact.findMany({
        where: { orgId: org.id, email: { in: emails.slice(i, i + CHUNK) } },
        select: { email: true, status: true },
      });
      for (const f of found) existingStatus.set(f.email, f.status);
    }

    // 表示用の最終ステータス（既存UNSUBSCRIBEDは保護）。
    const finalStatus = (r: BlastmailRow): PartnerContactStatus =>
      existingStatus.get(r.email) === "UNSUBSCRIBED" ? "UNSUBSCRIBED" : r.status;

    // --- 3a) 新規連絡先を一括作成。 ---
    const newRows = contactRows.filter(
      (r) => !existingStatus.has(r.email) && companyIdByName.has(r.company),
    );
    let contactsCreated = 0;
    for (let i = 0; i < newRows.length; i += CHUNK) {
      const slice = newRows.slice(i, i + CHUNK);
      const res = await prisma.partnerContact.createMany({
        data: slice.map((r) => ({
          orgId: org.id,
          companyId: companyIdByName.get(r.company)!,
          email: r.email,
          name: r.name,
          status: r.status,
          bounceCount: r.errorCount,
        })),
        skipDuplicates: true,
      });
      contactsCreated += res.count;
    }

    // --- 3b) 既存連絡先のステータスを一括更新（UNSUBSCRIBEDは触らない）。 ---
    const byTarget: Record<PartnerContactStatus, string[]> = { ACTIVE: [], BOUNCED: [], UNSUBSCRIBED: [] };
    let contactsUpdated = 0;
    for (const r of contactRows) {
      if (!existingStatus.has(r.email)) continue; // 新規はスキップ
      if (existingStatus.get(r.email) === "UNSUBSCRIBED") continue; // 保護
      byTarget[r.status].push(r.email);
    }
    for (const status of ["ACTIVE", "BOUNCED", "UNSUBSCRIBED"] as PartnerContactStatus[]) {
      const list = byTarget[status];
      for (let i = 0; i < list.length; i += CHUNK) {
        const res = await prisma.partnerContact.updateMany({
          where: { orgId: org.id, email: { in: list.slice(i, i + CHUNK) } },
          data: { status },
        });
        contactsUpdated += res.count;
      }
    }

    // --- 集計（表示用）。 ---
    const byStatus = { active: 0, bounced: 0, unsubscribed: 0 };
    for (const r of contactRows) {
      const s = finalStatus(r);
      if (s === "ACTIVE") byStatus.active++;
      else if (s === "BOUNCED") byStatus.bounced++;
      else byStatus.unsubscribed++;
    }

    const result: ImportResult = {
      totalRows: rows.length,
      companiesCreated: companyCreate.count,
      contactsCreated,
      contactsUpdated,
      skippedInvalid: errors.length,
      byStatus,
      errors: errors.slice(0, 50),
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/partners/import]", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
