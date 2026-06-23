import { prisma } from "@/lib/prisma";
import { getCurrentOrg } from "@/lib/current-org";
import { getAI } from "@/lib/ai";
import {
  fetchEmails,
  fetchEmailByIdLight,
  extractAttachmentsFor,
  listMessageIds,
  type FetchedEmail,
} from "./gmail";
import { companyDomain } from "@/lib/matching";
import { cleanEmailText, emailBodyHash } from "./clean";
import { prefilterEmail } from "./prefilter";
import type { RemotePreference } from "@prisma/client";

// 自社ドメイン。送信元がこのドメインなら自社保有人材(INHOUSE)、それ以外は他社(PARTNER)。
const OWN_DOMAIN = (process.env.COMPANY_DOMAIN ?? "obfall.co.jp").toLowerCase();

// 再送メール検出の窓（日）。同一ドメイン×同一本文をこの日数内に取込済みならLLMを呼ばずスキップ。
// SES業者は同じ案内を毎日再送するため、窓を広げるほど重複抽出（＝LLMコスト）を減らせる。
const DEDUP_DAYS = Number(process.env.MAIL_DEDUP_DAYS ?? "7") || 7;

// ウォーターマーク取得の安全マージン（分）。最終取込時刻からこの分だけ遡って取得し、
// 配信順の前後ズレや境界での取りこぼしを防ぐ（重複はdedupでスキップ）。
const AFTER_OVERLAP_MIN = Number(process.env.MAIL_AFTER_OVERLAP_MIN ?? "180") || 180;
// ウォーターマークが古すぎても、これより遡らない（暴走スキャン防止）。長期停止の回収は days=N で。
const AFTER_MAX_LOOKBACK_DAYS = Number(process.env.MAIL_AFTER_MAX_LOOKBACK_DAYS ?? "2") || 2;

/**
 * 最終取込（最新の受信時刻）を基に Gmail の after:<epoch秒> を算出する純関数。
 * - lastReceived が無ければ undefined（初回 → 既定の newer_than:1d にフォールバック）。
 * - overlap ぶん遡り、かつ now-maxLookback より古くはしない（再スキャン範囲を有界化）。
 */
export function afterEpochFrom(lastReceived: Date | null, now = Date.now()): number | undefined {
  if (!lastReceived) return undefined;
  const overlapMs = AFTER_OVERLAP_MIN * 60 * 1000;
  const maxLookbackMs = AFTER_MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const epochMs = Math.max(lastReceived.getTime() - overlapMs, now - maxLookbackMs);
  return Math.floor(epochMs / 1000); // Gmail の after: は Unix 秒
}

/** 取込済みメールの最新受信時刻から after:<epoch秒> を求める（無ければ undefined）。 */
async function computeIngestAfterEpoch(orgId: string): Promise<number | undefined> {
  const agg = await prisma.ingestedEmail.aggregate({
    where: { orgId, receivedAt: { not: null } },
    _max: { receivedAt: true },
  });
  return afterEpochFrom(agg._max.receivedAt ?? null);
}

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

type IngestOrg = Awaited<ReturnType<typeof getCurrentOrg>>;
type IngestAI = ReturnType<typeof getAI>;

/** メール配列を分類・登録し、結果と新規作成IDを返す（マッチングは行わない）。 */
async function ingestEmails(
  emails: FetchedEmail[],
  org: IngestOrg,
  ai: IngestAI,
): Promise<{ result: IngestRunResult; newTalentIds: string[]; newProjectIds: string[] }> {
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
    // dedup（同一メッセージ）
    const existing = await prisma.ingestedEmail.findUnique({
      where: { messageId: mail.messageId },
    });
    if (existing) {
      result.skipped++;
      continue;
    }

    const sourceEmail = parseFromEmail(mail.from);
    // LLM入力は引用・免責フッタを除去した本文（DB保存は原文のまま）。
    const cleanedText = cleanEmailText(mail.text);
    const bodyHash = emailBodyHash(companyDomain(sourceEmail), cleanedText);

    // 再送メール検出: 同一ドメイン×同一本文を DEDUP_DAYS 日以内に取込済みなら、LLMを呼ばずスキップ。
    // SES業者は同じ案件/人材を毎日再送するため、分類・抽出コストとレコード重複を防ぐ。
    // 本文が少しでも変われば（単価改定等）ハッシュが変わるので取り込まれる。
    const since = new Date(Date.now() - DEDUP_DAYS * 24 * 60 * 60 * 1000);
    const resent = await prisma.ingestedEmail.findFirst({
      where: {
        orgId: org.id,
        bodyHash,
        createdAt: { gte: since },
        kind: { not: "ERROR" }, // エラーだった取込は再試行させる
      },
      select: { id: true, kind: true },
    });
    if (resent) {
      const reason = `再送メール（3日以内に同一本文を取込済み: ${resent.kind}）`;
      await prisma.ingestedEmail
        .create({
          data: {
            orgId: org.id,
            messageId: mail.messageId,
            gmailId: mail.gmailId,
            fromAddr: mail.from ?? null,
            subject: mail.subject ?? null,
            receivedAt: mail.date ?? null,
            kind: "DUPLICATE",
            reason,
            bodyHash,
          },
        })
        .catch(() => {});
      result.skipped++;
      result.items.push({ subject: mail.subject, from: mail.from, kind: "DUPLICATE", reason });
      continue;
    }

    // LLM前の足切り: 自動返信・no-reply・空メール等はルールで弾き、分類/抽出のLLMを呼ばない。
    // 軽量取得では添付は未抽出なので、参照(attachmentRefs)の有無で「添付あり」を判定する。
    const hasAttachments =
      (mail.attachmentRefs?.length ?? 0) > 0 ||
      mail.attachments.some((a) => a.text?.trim() || a.dataBase64);
    const pre = prefilterEmail({
      from: mail.from,
      subject: mail.subject,
      text: cleanedText,
      hasAttachments,
    });
    if (pre.skip) {
      const reason = `ルール除外: ${pre.reason}`;
      await prisma.ingestedEmail
        .create({
          data: {
            orgId: org.id,
            messageId: mail.messageId,
            gmailId: mail.gmailId,
            fromAddr: mail.from ?? null,
            subject: mail.subject ?? null,
            receivedAt: mail.date ?? null,
            kind: "IGNORE",
            reason,
            bodyHash,
          },
        })
        .catch(() => {});
      result.ignored++;
      result.items.push({ subject: mail.subject, from: mail.from, kind: "IGNORE", reason });
      continue;
    }

    // ここまでで dedup（既取込・再送）と足切りを通過＝新規確定。重いPDF/Office抽出はここで初めて行う
    // （軽量取得で参照だけ持っている場合のみ。再送で捨てるメールに抽出コストをかけない）。
    if (mail.attachmentRefs && mail.attachmentRefs.length > 0 && mail.attachments.length === 0) {
      mail.attachments = await extractAttachmentsFor(mail.gmailId, mail.attachmentRefs);
    }

    const raw = `件名: ${mail.subject ?? ""}\n差出人: ${mail.from ?? ""}\n\n${cleanedText}`;

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
        // 添付スキルシート（PDF/Excel/Word）の抽出テキストを保存し、後で閲覧できるようにする
        // （軽量＝テキスト。生ファイルは保存しない）。最大8000文字に切り詰め。
        const skillSheetText =
          mail.attachments
            .filter((a) => a.text?.trim())
            .map((a) => `【${a.filename}】\n${a.text!.trim()}`)
            .join("\n\n")
            .slice(0, 8000) || null;
        const t = await prisma.talent.create({
          data: {
            orgId: org.id,
            talentType: isOwn ? "INHOUSE" : "PARTNER",
            dataFrom: "EMAIL",
            summaryText: skillSheetText,
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
            contactName: p.contactName ?? null,
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
          bodyHash,
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
            bodyHash,
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

  return { result, newTalentIds, newProjectIds };
}

// 取込とマッチは分離した（高流量で自動マッチが爆発し課金が大きいため）。
// 取込は分類・登録のみ。マッチは別途（1日1回のスケジュール rematch / 手動）で行う。

/** Fetch new mail, classify with AI, and register talents/projects.（最新 limit 件を一括処理）
 *  windowDays 指定で取得期間を広げて取りこぼしを回収できる（既取込はdedupでスキップ）。 */
export async function runMailIngest(limit = 20, windowDays?: number): Promise<IngestRunResult> {
  const org = await getCurrentOrg();
  const ai = getAI();
  // windowDays（手動回収）指定が無ければ、最終取込時刻以降だけを取得（再スキャン削減）。
  const afterEpoch = windowDays ? undefined : await computeIngestAfterEpoch(org.id);
  const emails = await fetchEmails(limit, windowDays, afterEpoch);
  const { result } = await ingestEmails(emails, org, ai);
  return result;
}

export interface IngestPageResult extends IngestRunResult {
  nextPageToken: string | null;
  done: boolean;
  // この実行で使った after:<epoch秒>（0=ウォーターマーク無し＝既定窓）。
  // ワークフローが後続ページに引き継ぎ、ページング中にクエリがブレないようにする。
  usedAfter: number;
}

/**
 * ページ単位の取り込み（タイムアウト回避）。pageToken で続きを辿る。
 * まず Gmail のメッセージID一覧だけ取得し、既取込(gmailId)を事前除外。新規だけ本文を
 * 取得して分類・登録する。重複はDB照会のみで安いので、全ページを辿っても速い
 * （= 過去にタイムアウトで未取込のまま残った古いメールも取りこぼさない）。
 * done は「次ページ無し」のみ。
 */
export async function runMailIngestPage(
  pageSize = 12,
  pageToken?: string,
  windowDays?: number,
  afterParam?: number,
): Promise<IngestPageResult> {
  const org = await getCurrentOrg();
  const ai = getAI();

  // 取得範囲の決定（ページング中にクエリがブレないよう usedAfter を後続ページへ引き継ぐ）:
  // - windowDays(手動回収) 指定時は newer_than 優先（after は使わない）→ usedAfter=0。
  // - afterParam 未指定（1ページ目）はウォーターマークを算出。あれば after:W、無ければ既定窓。
  // - afterParam>0 はその値をそのまま使用（2ページ目以降）。afterParam==0 は「既定窓」を維持。
  let after: number | undefined;
  let usedAfter = 0;
  if (windowDays) {
    after = undefined;
  } else if (afterParam === undefined) {
    after = await computeIngestAfterEpoch(org.id);
    usedAfter = after ?? 0;
  } else if (afterParam > 0) {
    after = afterParam;
    usedAfter = afterParam;
  } else {
    after = undefined; // afterParam===0 → 既定窓を維持（再算出しない）
  }

  const { ids, nextPageToken } = await listMessageIds(pageSize, pageToken, windowDays, after);

  // gmailId で既取込を事前除外（本文取得・LLM不要で重複ページを安く飛ばす）。
  const known = ids.length
    ? await prisma.ingestedEmail.findMany({
        where: { orgId: org.id, gmailId: { in: ids } },
        select: { gmailId: true },
      })
    : [];
  const knownSet = new Set(known.map((k) => k.gmailId));
  const newIds = ids.filter((id) => !knownSet.has(id));

  // 新規だけ本文を取得（軽量＝添付は参照のみ。抽出は dedup 通過後に遅延）。
  const emails: FetchedEmail[] = [];
  for (const id of newIds) {
    const m = await fetchEmailByIdLight(id);
    if (m) emails.push(m);
  }

  const { result } = await ingestEmails(emails, org, ai);

  // 表示用集計を1ページ全体に補正（gmailId事前除外分も重複に含める）。
  const gmailDup = ids.length - newIds.length;
  result.fetched = ids.length;
  result.skipped += gmailDup;

  return { ...result, nextPageToken, done: !nextPageToken, usedAfter };
}
