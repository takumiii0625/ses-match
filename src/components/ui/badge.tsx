import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "green" | "amber" | "slate" | "red" | "indigo";

const tones: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  slate: "bg-slate-100 text-slate-600",
  red: "bg-red-50 text-red-700",
  indigo: "bg-indigo-50 text-indigo-700",
};

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

const STATUS_TONE: Record<string, Tone> = {
  PROPOSING: "amber",
  ACTIVE: "green",
  CLOSED: "slate",
  OPEN: "blue",
  DECIDED: "indigo",
  NONE: "slate",
};

export function statusTone(status: string): Tone {
  return STATUS_TONE[status] ?? "slate";
}
