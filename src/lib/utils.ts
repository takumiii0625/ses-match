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
