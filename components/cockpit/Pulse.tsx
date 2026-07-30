"use client";

/**
 * Pulse — one-glance live state.
 *
 * Composed from ONLY existing REST/WS wire (slice 1 constraint):
 *   - api.brain.status              → ready dot + model + cycle count + last action
 *   - api.objectives.list           → current objective title (first non-terminal)
 *   - useBrainStore.logs (WS-fed)   → last N THOUGHT lines, auto-scroll
 *
 * Empty states are explicit — a stopped service reads "Morgoth is
 * stopped", not a hopeful spinner.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useBrainStore } from "@/lib/store/brain.store";
import { cn } from "@/lib/utils/cn";
import type { LogEntry } from "@/types/morgoth";

const ACTIVE_STATUSES = new Set(["pending", "in_progress"]);
const THOUGHT_TAIL = 5;

function PulseSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-40 rounded bg-surface2" />
      <div className="h-3 w-64 rounded bg-surface2" />
      <div className="h-3 w-56 rounded bg-surface2" />
      <div className="h-24 w-full rounded bg-surface2" />
    </div>
  );
}

function ReadyDot({ ready }: { ready: boolean | undefined }) {
  const color =
    ready === undefined ? "bg-textMuted" : ready ? "bg-result" : "bg-error";
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        color,
        ready && "animate-pulse-glow",
      )}
      aria-label={ready ? "ready" : "not ready"}
    />
  );
}

export function Pulse() {
  const statusQuery = useQuery({
    queryKey: ["brain", "status"],
    queryFn: api.brain.status,
    refetchInterval: 5_000,
    staleTime: 4_000,
    retry: false,
  });
  const objectivesQuery = useQuery({
    queryKey: ["objectives", "list"],
    queryFn: api.objectives.list,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const logs = useBrainStore((state) => state.logs);
  const status = statusQuery.data;

  const currentObjective = useMemo(
    () =>
      (objectivesQuery.data ?? []).find((o) =>
        ACTIVE_STATUSES.has(o.status),
      ) ?? null,
    [objectivesQuery.data],
  );

  const thoughtTail = useMemo<LogEntry[]>(
    () =>
      logs
        .filter((entry) => entry.level === "THOUGHT")
        .slice(-THOUGHT_TAIL)
        .reverse(),
    [logs],
  );

  // Service-offline state — surface it explicitly instead of spinning.
  if (statusQuery.isError) {
    return (
      <Card className="flex h-full flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReadyDot ready={false} />
            Morgoth is stopped
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-textSecondary">
          The backend at <span className="font-mono">/api/brain/status</span> is
          not responding. Run <span className="font-mono">morgoth start</span>{" "}
          from a shell.
        </CardContent>
      </Card>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <Card className="flex h-full flex-col">
        <CardContent className="flex-1 p-6">
          <PulseSkeleton />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ReadyDot ready={status?.ready} />
          <span>Pulse</span>
          <span className="ml-auto font-mono text-xs text-textSecondary">
            {status?.primary_model ?? "unknown"}
          </span>
        </CardTitle>
        <div className="grid grid-cols-2 gap-2 text-xs text-textSecondary">
          <div>
            Cycles:{" "}
            <span className="font-mono text-textPrimary">
              {status?.total_cycles_completed ?? 0}
            </span>
          </div>
          <div className="truncate">
            Last:{" "}
            <span
              className="font-mono text-textPrimary"
              title={status?.last_cycle_action ?? ""}
            >
              {status?.last_cycle_action ?? "(idle)"}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <section>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-textMuted">
            Current objective
          </div>
          {currentObjective ? (
            <div className="mt-1">
              <div className="truncate text-sm font-medium text-textPrimary">
                {currentObjective.title}
              </div>
              <div className="mt-0.5 text-xs text-textSecondary">
                {currentObjective.status} · {currentObjective.category}
              </div>
            </div>
          ) : (
            <div className="mt-1 text-sm text-textMuted">
              No active objective.
            </div>
          )}
        </section>

        <section>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-textMuted">
            Thought stream
          </div>
          {thoughtTail.length === 0 ? (
            <div className="mt-1 text-sm text-textMuted">
              No thoughts yet.
            </div>
          ) : (
            <div className="mt-1 space-y-1 font-mono text-xs text-textSecondary">
              {thoughtTail.map((t) => (
                <div key={t.log_id} className="truncate" title={t.content}>
                  <span className="text-textMuted">
                    {new Date(t.timestamp).toLocaleTimeString("en-US", {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>{" "}
                  <span className="text-textSecondary">{t.content}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
