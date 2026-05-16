"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Cpu, Target } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { api } from "@/lib/api";
import { formatMB, formatRelativeTime, formatUptime } from "@/lib/utils/format";

function Divider() {
  return <div className="h-4 w-px bg-zinc-800 shrink-0" />;
}

export function StatusBar() {
  const statusQuery = useQuery({
    queryKey: ["brain", "status"],
    queryFn: api.brain.status,
    refetchInterval: 10_000,
    staleTime: 10_000,
  });

  const statsQuery = useQuery({
    queryKey: ["objectives", "stats"],
    queryFn: api.objectives.stats,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const status = statusQuery.data;
  const stats = statsQuery.data;

  const vramUsed = status?.vram_used_mb ?? null;
  const vramTotal = status?.vram_total_mb ?? null;
  const vramPct = vramUsed !== null && vramTotal !== null && vramTotal > 0 ? vramUsed / vramTotal : null;

  const totalObjs = stats?.total ?? 0;
  const doneObjs = stats?.by_status?.["completed"] ?? 0;
  const pendingObjs = (stats?.by_status?.["pending"] ?? 0) + (stats?.by_status?.["in_progress"] ?? 0);
  const failedObjs = stats?.by_status?.["failed"] ?? 0;
  const completionRatio = totalObjs > 0 ? doneObjs / totalObjs : 0;
  const isFullyAutoCompleted = totalObjs > 0 && completionRatio >= 1;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-800 bg-zinc-950/98 px-4 py-2 backdrop-blur-sm font-mono text-xs">
      {/* Online indicator */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "h-2 w-2 rounded-full shrink-0",
            status?.ready ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
          )}
        />
        <span
          className={cn(
            "font-semibold uppercase tracking-widest",
            status?.ready ? "text-emerald-400" : "text-zinc-500"
          )}
        >
          {statusQuery.isLoading ? "CONNECTING" : status?.ready ? "MORGOTH ONLINE" : "MORGOTH OFFLINE"}
        </span>
      </div>

      <Divider />

      {/* Uptime */}
      <div className="flex items-center gap-1 text-zinc-500">
        <Activity className="h-3 w-3 shrink-0" />
        {status?.uptime_seconds !== undefined ? (
          <span>
            UP <span className="text-zinc-300">{formatUptime(status.uptime_seconds)}</span>
          </span>
        ) : (
          <span className="text-zinc-600">UPTIME N/A</span>
        )}
      </div>

      <Divider />

      {/* Cycle info */}
      <div className="flex items-center gap-2 text-zinc-500">
        {status?.cycle_count !== undefined ? (
          <>
            <span>
              CYCLE <span className="text-cyan-400">#{status.cycle_count.toLocaleString()}</span>
            </span>
            {status.last_cycle_at ? (
              <span>
                LAST <span className="text-zinc-300">{formatRelativeTime(status.last_cycle_at)}</span>
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-zinc-600">CYCLE N/A</span>
        )}
      </div>

      <Divider />

      {/* VRAM gauge */}
      <div className="flex items-center gap-2 text-zinc-500">
        <Cpu className="h-3 w-3 shrink-0" />
        {vramPct !== null ? (
          <>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  vramPct > 0.9 ? "bg-red-500" : vramPct > 0.75 ? "bg-amber-500" : "bg-cyan-500"
                )}
                style={{ width: `${Math.min(vramPct * 100, 100).toFixed(1)}%` }}
              />
            </div>
            <span
              className={cn(
                vramPct > 0.9 ? "text-red-400" : vramPct > 0.75 ? "text-amber-400" : "text-zinc-300"
              )}
            >
              {formatMB(vramUsed!)} / {formatMB(vramTotal!)}
            </span>
          </>
        ) : (
          <span className="text-zinc-600">VRAM N/A</span>
        )}
      </div>

      <Divider />

      {/* Objectives summary */}
      <div className="flex items-center gap-2 text-zinc-500">
        <Target className="h-3 w-3 shrink-0" />
        {statsQuery.isLoading ? (
          <span className="text-zinc-600">loading...</span>
        ) : (
          <>
            <span>
              <span className="text-zinc-300">{totalObjs}</span> OBJ
            </span>
            <span className="text-emerald-400">{doneObjs} DONE</span>
            <span className="text-amber-400">{pendingObjs} ACTIVE</span>
            {failedObjs > 0 ? <span className="text-red-400">{failedObjs} FAIL</span> : null}
          </>
        )}
      </div>

      <Divider />

      {/* Auto-completion ratio */}
      <div
        className={cn(
          "flex items-center gap-1",
          isFullyAutoCompleted ? "text-red-400" : "text-zinc-500"
        )}
      >
        {isFullyAutoCompleted ? <AlertTriangle className="h-3 w-3 shrink-0" /> : null}
        <span>
          AUTO {(completionRatio * 100).toFixed(0)}%
          {isFullyAutoCompleted ? " — ALL COMPLETE" : ""}
        </span>
      </div>
    </div>
  );
}
