"use client";

/**
 * DecisionsStrip — read-only pending-proposal digest at the bottom of
 * the cockpit. Collapses to nothing when empty (typical case).
 *
 * Slice 1: reads from api.proposals.pendingCount() (stubbed to 0). When
 * slice 2 wires the backend list endpoint, this component will render
 * one row per pending_approval proposal with tool_name + rationale +
 * [View] link — still READ ONLY. Approve/Reject buttons land in slice 3.
 *
 * The zero-state renders NOTHING (no chrome, no empty-list message)
 * so an idle Morgoth doesn't add visual noise to the cockpit.
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export function DecisionsStrip() {
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
    <div className="border-t border-border bg-surface px-4 py-2 text-xs text-textSecondary">
      <span className="font-semibold text-textPrimary">{count}</span>{" "}
      proposal{count === 1 ? "" : "s"} awaiting gate 3.{" "}
      <a
        href="/evolution"
        className="font-mono text-primary transition hover:text-textPrimary"
      >
        Review →
      </a>
    </div>
  );
}
