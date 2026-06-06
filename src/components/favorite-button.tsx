"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  talentId?: string;
  projectId?: string;
  initial: boolean;
}

export function FavoriteButton({ talentId, projectId, initial }: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isPending) return;

    // Optimistic toggle
    setFavorited((prev) => !prev);

    startTransition(async () => {
      try {
        const body: Record<string, string> = {};
        if (talentId) body.talentId = talentId;
        if (projectId) body.projectId = projectId;

        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          // Revert on error
          setFavorited((prev) => !prev);
          return;
        }

        const data = await res.json();
        setFavorited(data.favorited);
        router.refresh();
      } catch {
        // Revert on network error
        setFavorited((prev) => !prev);
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      title={favorited ? "お気に入りから削除" : "お気に入りに追加"}
      className={cn(
        "inline-flex items-center justify-center rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:opacity-50",
        favorited
          ? "text-amber-400 hover:text-amber-500"
          : "text-slate-300 hover:text-amber-400",
      )}
    >
      <Star
        className={cn("h-4 w-4", favorited && "fill-amber-400")}
        strokeWidth={1.8}
      />
    </button>
  );
}
