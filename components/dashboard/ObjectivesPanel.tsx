"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils/cn";
import { api } from "@/lib/api";
import { ObjectiveCard } from "@/components/dashboard/ObjectiveCard";
import type { Objective, ObjectiveStatus } from "@/types/morgoth";

const STATUS_ORDER: ObjectiveStatus[] = ["in_progress", "pending", "blocked", "failed", "completed"];

const STATUS_LABEL: Record<ObjectiveStatus, string> = {
  in_progress: "In Progress",
  pending: "Pending",
  blocked: "Blocked",
  failed: "Failed",
  completed: "Completed",
};

const STATUS_HEADER_COLOR: Record<ObjectiveStatus, string> = {
  in_progress: "text-cyan-400 border-cyan-900",
  pending:     "text-amber-400 border-amber-900",
  blocked:     "text-amber-400 border-amber-900",
  failed:      "text-red-400 border-red-900",
  completed:   "text-emerald-400 border-emerald-900",
};

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2">
      <div className="h-3 w-3/4 rounded bg-zinc-800" />
      <div className="flex gap-1">
        <div className="h-4 w-16 rounded bg-zinc-800" />
        <div className="h-4 w-12 rounded bg-zinc-800" />
      </div>
      <div className="h-2 w-full rounded bg-zinc-800" />
      <div className="h-1 w-full rounded bg-zinc-800" />
    </div>
  );
}

function StatusGroup({
  status,
  objectives,
}: {
  status: ObjectiveStatus;
  objectives: Objective[];
}) {
  if (objectives.length === 0) return null;

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex items-center gap-2 border-b pb-1 font-mono text-[10px] font-semibold uppercase tracking-widest",
          STATUS_HEADER_COLOR[status]
        )}
      >
        <span>{STATUS_LABEL[status]}</span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">{objectives.length}</span>
      </div>
      <div className="space-y-2">
        {objectives.map((obj) => (
          <ObjectiveCard key={obj.objective_id} objective={obj} />
        ))}
      </div>
    </div>
  );
}

export function ObjectivesPanel() {
  const objectivesQuery = useQuery({
    queryKey: ["objectives"],
    queryFn: api.objectives.list,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const objectives = objectivesQuery.data ?? [];

  const grouped = useMemo(() => {
    const map: Partial<Record<ObjectiveStatus, Objective[]>> = {};
    for (const obj of objectives) {
      if (!map[obj.status]) map[obj.status] = [];
      map[obj.status]!.push(obj);
    }
    return map;
  }, [objectives]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Objectives
        </span>
        <div className="flex items-center gap-2">
          {objectivesQuery.isFetching ? (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          ) : null}
          <span className="font-mono text-xs text-zinc-600">{objectives.length} total</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {objectivesQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : objectivesQuery.isError ? (
          <div className="rounded border border-red-800/50 bg-red-950/20 p-3 font-mono text-xs text-red-400">
            Failed to load objectives — backend may be offline.
          </div>
        ) : objectives.length === 0 ? (
          <div className="p-6 text-center">
            <p className="font-mono text-xs text-zinc-600">No objectives yet.</p>
            <p className="mt-1 font-mono text-[10px] text-zinc-700">
              Morgoth will generate objectives autonomously as it observes its environment.
            </p>
          </div>
        ) : (
          STATUS_ORDER.map((status) => (
            <StatusGroup
              key={status}
              status={status}
              objectives={grouped[status] ?? []}
            />
          ))
        )}
      </div>
    </div>
  );
}
