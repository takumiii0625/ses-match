import { prisma } from "@/lib/prisma";
import { companyDomain } from "@/lib/matching";

/**
 * NG企業の入力（メールアドレス / ドメイン / URL）を正規化したドメインに変換する。
 * フリーメール（gmail等）や妥当でない入力は null（NG指定不可）。
 * 例: "a@example.co.jp" / "https://www.example.co.jp/x" / "Example.co.jp" → "example.co.jp"
 */
export function normalizeNgDomain(raw: string): string | null {
  let s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("@")) {
    const m = s.match(/@([a-z0-9.-]+)/);
    s = m ? m[1] : "";
  }
  s = s
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  // 妥当性＋フリーメール除外は companyDomain に委譲（フリーメールは null を返す）。
  const d = companyDomain(`x@${s}`);
  return d && d.includes(".") ? d : null;
}

/** 組織のNG企業ドメイン集合を読み込む（マッチング除外用）。 */
export async function loadNgDomains(orgId: string): Promise<Set<string>> {
  const rows = await prisma.ngCompany.findMany({
    where: { orgId },
    select: { domain: true },
  });
  return new Set(rows.map((r) => r.domain));
}

/** メールの会社ドメインがNG集合に含まれるか（フリーメール/不明は false）。 */
export function isNgDomain(email: string | null | undefined, ng: Set<string>): boolean {
  if (ng.size === 0) return false;
  const d = companyDomain(email);
  return !!d && ng.has(d);
}
