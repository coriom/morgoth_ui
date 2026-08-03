"use client";

/**
 * Cross-page alert banner for pending_approval proposals.
 *
 * Rendered from the root layout so it sits above every page (cockpit,
 * wiki, knowledge, evolution itself). The existing TopBar PendingBadge
 * is a subtle chip — this is the louder, "you have work waiting" signal
 * the operator asked for on wiki (where they lose track of the mind
 * accumulating pendings while they read notes).
 *
 * Renders NOTHING on the evolution page (avoid duplicate signal — the
 * dossier below IS the review surface) and NOTHING when count = 0.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export function PendingAlert() {
  const pathname = usePathname();
  const { data: count = 0 } = useQuery({
    queryKey: ["proposals", "pending", "count"],
    queryFn: api.proposals.pendingCount,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  if (!count) return null;
  if (pathname === "/evolution") return null;

  return (
    <Link
      href="/evolution"
      className="block border-b border-primary/40 bg-primary/10 px-6 py-2 text-sm text-primary transition hover:bg-primary/20"
    >
      <span className="font-semibold">{count} proposal{count === 1 ? "" : "s"}</span>{" "}
      awaiting your decision — click to review.
    </Link>
  );
}
