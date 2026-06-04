import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { prisma } from "@/lib/prisma";

async function getSidebarUser() {
  try {
    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      include: {
        users: { where: { role: "ADMIN" }, take: 1, orderBy: { name: "asc" } },
      },
    });
    return {
      userName: org?.users[0]?.name ?? "ゲスト",
      orgName: org?.name ?? "",
    };
  } catch {
    return { userName: "ゲスト", orgName: "" };
  }
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SES Match — 人材・案件マッチング",
  description: "SES業界向け 人材・案件マッチング自動化プラットフォーム",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { userName, orgName } = await getSidebarUser();
  return (
    <html lang="ja" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="flex h-screen overflow-hidden">
          <Sidebar userName={userName} orgName={orgName} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
