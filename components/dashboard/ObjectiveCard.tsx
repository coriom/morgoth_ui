"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import type { Objective, ObjectiveStatus } from "@/types/morgoth";

const MAX_CYCLES = 10;

function statusColor(status: ObjectiveStatus): string {
  switch (status) {
    case "in_progress": return "text-cyan-400 border-cyan-800/60 bg-cyan-950/30";
    case "completed":   return "text-emerald-400 border-emerald-800/60 bg-emerald-950/30";
    case "failed":      return "text-red-400 border-red-800/60 bg-red-950/30";
    case "blocked":     return "text-amber-400 border-amber-800/60 bg-amber-950/30";
    default:            return "text-zinc-400 border-zinc-700/60 bg-zinc-800/30";
  }
}

function progressColor(status: ObjectiveStatus): string {
  switch (status) {
    case "in_progress": return "bg-cyan-500";
    case "completed":   return "bg-emerald-500";
    case "failed":      return "bg-red-500";
    case "blocked":     return "bg-amber-500";
    default:            return "bg-zinc-600";
  }
}

function progressWidth(status: ObjectiveStatus, cycleCount?: number): string {
  if (cycleCount !== undefined) {
    const pct = Math.min((cycleCount / MAX_CYCLES) * 100, 100);
    return `${pct.toFixed(1)}%`;
  }
  switch (status) {
    case "completed":   return "100%";
    case "in_progress": return "60%";
    case "failed":      return "20%";
    case "blocked":     return "10%";
    default:            return "5%";
  }
}

function EvidenceSection({ evidence }: { evidence: Objective["evidence"] }) {
  const [open, setOpen] = useState(false);
  const items = Array.isArray(evidence) ? evidence : [evidence];
  const nonEmpty = items.filter((e) => e && Object.keys(e).length > 0);

  if (nonEmpty.length === 0) return null;

  return (
    <div className="mt-2 rounded border border-zinc-800/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1 text-left font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        EVIDENCE ({nonEmpty.length})
      </button>
      {open ? (
        <div className="border-t border-zinc-800/60 bg-zinc-950/50 px-2 py-2 space-y-1">
          {nonEmpty.map((item, i) => (
            <pre
              key={i}
              className="whitespace-pre-wrap break-all font-mono text-[10px] text-zinc-400"
            >
              {JSON.stringify(item, null, 2)}
            </pre>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ObjectiveCard({ objective }: { objective: Objective }) {
  const isAutoCompleted = objective.status === "completed" && objective.generated_by === "morgoth";
  const isManualCompleted = objective.status === "completed" && objective.generated_by === "human";
  const cycleCount = (objective as Objective & { cycle_count?: number }).cycle_count;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-xs font-semibold text-zinc-200 leading-tight">{objective.title}</p>
          <div className="flex flex-wrap gap-1">
            {/* Status badge */}
            <span
              className={cn(
                "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                statusColor(objective.status)
              )}
            >
              {objective.status.replace("_", " ")}
            </span>

            {/* Auto-completed or manually completed */}
            {isAutoCompleted ? (
              <span className="inline-flex items-center rounded border border-amber-700/60 bg-amber-950/30 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                AUTO
              </span>
            ) : null}
            {isManualCompleted ? (
              <span className="inline-flex items-center rounded border border-emerald-700/60 bg-emerald-950/30 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                HUMAN
              </span>
            ) : null}

            {/* Category */}
            <span className="inline-flex items-center rounded border border-zinc-700/60 bg-zinc-800/30 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
              {objective.category}
            </span>

            {/* Priority */}
            <span className="inline-flex items-center rounded border border-zinc-700/60 bg-zinc-800/30 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              P{objective.priority}
            </span>
          </div>
        </div>

        <span className="shrink-0 font-mono text-[10px] text-zinc-600">
          {formatRelativeTime(objective.created_at)}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{objective.description}</p>

      {/* Progress bar */}
      <div>
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-zinc-600">
          <span>{cycleCount !== undefined ? `${cycleCount}/${MAX_CYCLES} cycles` : "progress"}</span>
          <span>{progressWidth(objective.status, cycleCount).replace("%", "")}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={cn("h-full rounded-full transition-all duration-700", progressColor(objective.status))}
            style={{ width: progressWidth(objective.status, cycleCount) }}
          />
        </div>
      </div>

      {/* Evidence accordion */}
      <EvidenceSection evidence={objective.evidence} />
    </div>
  );
}
