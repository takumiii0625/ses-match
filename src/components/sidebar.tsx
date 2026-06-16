"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  UserSearch,
  Building2,
  Handshake,
  Briefcase,
  GitCompareArrows,
  ListChecks,
  UserCheck,
  Mail,
  MailCheck,
  Send,
  Megaphone,
  FileText,
  ScrollText,
  BarChart3,
  LineChart,
  FlaskConical,
  UsersRound,
  Ban,
  Settings,
  ChevronRight,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** カドゥケウス（杖＋絡み合う2匹の蛇＋翼）の定番ロゴ。 */
function CaduceusMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* 杖 */}
      <path d="M12 4.2V20" />
      {/* 頂部の球 */}
      <circle cx="12" cy="3.4" r="1" fill="currentColor" stroke="none" />
      {/* 翼（左右に羽根を4枚ずつ扇状に） */}
      <path d="M11.2 5C8 3.4 5.2 3.6 3.4 5" />
      <path d="M11.3 5.6C8.6 4.3 6.2 4.6 4.6 5.8" />
      <path d="M11.4 6.1C9.2 5.2 7.3 5.6 6.1 6.6" />
      <path d="M11.5 6.6C9.6 6 8.2 6.4 7.2 7.2" />
      <path d="M12.8 5C16 3.4 18.8 3.6 20.6 5" />
      <path d="M12.7 5.6C15.4 4.3 17.8 4.6 19.4 5.8" />
      <path d="M12.6 6.1C14.8 5.2 16.7 5.6 17.9 6.6" />
      <path d="M12.5 6.6C14.4 6 15.8 6.4 16.8 7.2" />
      {/* 絡み合う2匹の蛇 */}
      <path d="M11 7C8.8 8 8.8 9.2 12 10C15.2 10.8 15.2 12.2 12 13C8.8 13.8 8.8 15.2 12 16C15.2 16.8 14.8 18.2 12 19" />
      <path d="M13 7C15.2 8 15.2 9.2 12 10C8.8 10.8 8.8 12.2 12 13C15.2 13.8 15.2 15.2 12 16C8.8 16.8 9.2 18.2 12 19" />
      {/* 蛇の頭 */}
      <circle cx="11" cy="6.7" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="13" cy="6.7" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "検索",
    items: [
      { href: "/in-house-talent", label: "自社保有人材", icon: UserSearch },
      { href: "/partner-talent", label: "他社人材", icon: Building2 },
      { href: "/projects", label: "案件", icon: Briefcase },
      { href: "/partners", label: "提携先会社", icon: Handshake },
      { href: "/ng-companies", label: "NG企業", icon: Ban },
    ],
  },
  {
    title: "ツール",
    items: [
      { href: "/matching", label: "マッチング", icon: GitCompareArrows },
      { href: "/matches", label: "マッチ一覧", icon: ListChecks },
      { href: "/matches/inhouse", label: "自社マッチ", icon: UserCheck },
      { href: "/ingest", label: "メール取り込み", icon: Mail },
      { href: "/mail", label: "メール自動取込", icon: MailCheck },
      { href: "/proposals", label: "提案管理", icon: FileText },
      { href: "/partners/blast", label: "一斉案内", icon: Megaphone },
      { href: "/sent-emails", label: "送信履歴", icon: Send },
    ],
  },
  {
    title: "管理",
    items: [
      { href: "/prompts", label: "プロンプト", icon: ScrollText },
      { href: "/analytics", label: "分析", icon: LineChart },
      { href: "/reports", label: "レポート", icon: BarChart3 },
      { href: "/members", label: "メンバー", icon: UsersRound },
      { href: "/test-mail", label: "テスト送信", icon: FlaskConical },
    ],
  },
];

export function Sidebar({
  userName = "ゲスト",
  orgName = "",
  authEnabled = false,
}: {
  userName?: string;
  orgName?: string;
  authEnabled?: boolean;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  // 最長一致で active を1つだけに（例: /matches と /matches/inhouse の二重ハイライト防止）。
  const allHrefs = [...groups.flatMap((g) => g.items.map((i) => i.href)), "/settings"];
  const activeHref = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const NavLink = ({ href, label, icon: Icon }: NavItem) => {
    const active = href === activeHref;
    return (
      <Link
        href={href}
        title={label}
        className={cn(
          "flex items-center gap-3 rounded-xl px-2.5 transition-colors",
          expanded ? "h-10 w-full" : "h-11 w-11 justify-center",
          active
            ? "bg-amber-50 text-primary"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {expanded && (
          <span className="truncate text-sm font-medium">{label}</span>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "relative flex shrink-0 flex-col border-r border-border bg-white py-4 transition-[width] duration-200",
        expanded ? "w-56 px-3" : "w-16 items-center px-0",
      )}
    >
      {/* logo */}
      <Link
        href="/in-house-talent"
        className={cn(
          "mb-4 flex items-center gap-2.5",
          expanded ? "px-1" : "justify-center",
        )}
        title="Kerykeion"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-yellow-800 text-white shadow-sm ring-1 ring-black/5">
          <CaduceusMark className="h-[22px] w-[22px]" />
        </span>
        {expanded && (
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-tight text-slate-800">Kerykeion</span>
            <span className="mt-0.5 text-[10px] font-medium text-slate-400">人材・案件マッチング</span>
          </span>
        )}
      </Link>

      {/* collapse toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "折りたたむ" : "展開する"}
        className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-white text-slate-400 shadow-sm hover:text-slate-600"
      >
        {expanded ? (
          <ChevronLeft className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>

      {/* nav groups */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.title} className="flex flex-col gap-1">
            {expanded ? (
              <div className="mt-3 mb-0.5 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {group.title}
              </div>
            ) : (
              gi > 0 && <div className="my-1 h-px w-8 self-center bg-border" />
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        ))}
      </nav>

      {/* footer: settings + user */}
      <div className="mt-2 flex flex-col gap-1 border-t border-border pt-3">
        <NavLink href="/settings" label="設定" icon={Settings} />
        {authEnabled && (
          <div
            className={cn(
              "flex items-center gap-2 py-1.5",
              expanded ? "px-2" : "justify-center px-0",
            )}
          >
            <UserButton />
            {expanded && <span className="text-sm text-slate-600">アカウント</span>}
          </div>
        )}
        <Link
          href="/members"
          title={userName}
          className={cn(
            "flex items-center gap-2.5 rounded-xl py-1.5 transition-colors hover:bg-slate-100",
            expanded ? "px-2" : "justify-center px-0",
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-600 text-sm font-medium text-white">
            {userName.slice(0, 1)}
          </span>
          {expanded && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-800">
                {userName}
              </span>
              {orgName && (
                <span className="block truncate text-[11px] text-slate-400">
                  {orgName}
                </span>
              )}
            </span>
          )}
        </Link>
      </div>
    </aside>
  );
}
