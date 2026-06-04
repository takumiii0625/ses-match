"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Briefcase,
  GitCompareArrows,
  Mail,
  Settings,
  Droplet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/in-house-talent", label: "自社保有人材", icon: Users },
  { href: "/projects", label: "案件", icon: Briefcase },
  { href: "/matching", label: "マッチング", icon: GitCompareArrows },
  { href: "/ingest", label: "メール取り込み", icon: Mail },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-16 flex-col items-center gap-1 border-r border-border bg-white py-4">
      <Link
        href="/in-house-talent"
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white"
        title="SES Match"
      >
        <Droplet className="h-5 w-5" />
      </Link>
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              "flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] transition-colors",
              active
                ? "bg-blue-50 text-primary"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
      <div className="mt-auto">
        <button
          title="設定"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
