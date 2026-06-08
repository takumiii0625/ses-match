import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 月額報酬レンジ表示: 80万〜 / 60〜80万 など */
export function formatRate(min?: number | null, max?: number | null): string {
  if (min != null && max != null) return `${min}〜${max}万`;
  if (min != null) return `${min}万〜`;
  if (max != null) return `〜${max}万`;
  return "-";
}

export function formatAge(age?: number | null): string {
  return age != null ? String(age) : "-";
}

/** 配信日からの経過日数を「今日 / N日前」で表す。 */
export function daysAgo(d?: Date | string | null): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "今日";
  if (days === 1) return "1日前";
  return `${days}日前`;
}
