import { prisma } from "@/lib/prisma";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata = { title: "配信停止" };
export const dynamic = "force-dynamic";

export default async function UnsubscribePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const contact = await prisma.partnerContact.findUnique({
    where: { unsubscribeToken: token },
    select: { email: true, status: true, company: { select: { name: true } } },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">メール配信の停止</h1>
        {!contact ? (
          <p className="mt-4 text-sm text-slate-600">
            このリンクは無効です。お手数ですが送信元（sales@obfall.co.jp）までご連絡ください。
          </p>
        ) : contact.status === "UNSUBSCRIBED" ? (
          <p className="mt-4 text-sm text-emerald-700">
            {contact.email} は既に配信停止済みです。今後、人材紹介のご案内は送信されません。
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-600">
              <span className="font-medium">{contact.email}</span>
              （{contact.company.name}）宛の人材紹介ご案内メールの配信を停止します。
            </p>
            <UnsubscribeForm token={token} />
            <p className="mt-4 text-xs text-muted">
              OBFall株式会社 / sales@obfall.co.jp
            </p>
          </>
        )}
      </div>
    </div>
  );
}
