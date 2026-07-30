"use client";

/**
 * PendingBadge — anti-"frozen verdict" indicator.
 *
 * Renders a count of pending_approval proposals in the shared TopBar
 * so the operator sees at a glance from EVERY page when Morgoth has
 * work waiting on gate 3.
 *
 * Slice 1: wired to api.proposals.pendingCount() which currently stubs
 * to 0 (the "NO new endpoints" rule for this slice). Slice 2 wires the
 * backend read endpoint; this component lights up automatically then.
 * Renders NOTHING when count = 0 so the header stays quiet on an empty
 * queue.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils/cn";

export function PendingBadge() {
  const { data: count = 0 } = useQuery({
    queryKey: ["proposals", "pending", "count"],
    queryFn: api.proposals.pendingCount,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  if (!count) {
    return null;
  }

  return (
    <Link
      href="/evolution"
      title={`${count} proposal${count === 1 ? "" : "s"} awaiting gate 3`}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-2.5 py-0.5",
        "text-xs font-semibold text-primary transition hover:bg-primary/20 hover:text-textPrimary",
      )}
    >
      <span className="inline-block h-1.5 w-1.5 animate-pulse-glow rounded-full bg-primary" />
      {count} pending
    </Link>
  );
}
