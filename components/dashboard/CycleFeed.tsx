"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, CheckCircle, Settings, XCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { api } from "@/lib/api";
import type { LogEntry, LogLevel } from "@/types/morgoth";

const LEVEL_CONFIG: Record<
  LogLevel,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  THOUGHT: { icon: Brain, color: "text-zinc-400", bg: "bg-zinc-800/40", label: "THINK" },
  ACTION:  { icon: Zap, color: "text-cyan-400", bg: "bg-cyan-950/30", label: "TOOL" },
  RESULT:  { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-950/30", label: "OK" },
  ERROR:   { icon: XCircle, color: "text-red-400", bg: "bg-red-950/30", label: "ERR" },
  SYSTEM:  { icon: Settings, color: "text-amber-400", bg: "bg-amber-950/20", label: "SYS" },
};

function extractTool(content: string): string | null {
  const match = content.match(/tool[:\s]+([a-zA-Z_][a-zA-Z0-9_]*)/i)
    ?? content.match(/calling\s+([a-zA-Z_][a-zA-Z0-9_]*)/i)
    ?? content.match(/\b([a-zA-Z_][a-zA-Z0-9_]{2,})\(/);
  return match ? match[1] : null;
}

function LogRow({ entry }: { entry: LogEntry }) {
  const cfg = LEVEL_CONFIG[entry.level] ?? LEVEL_CONFIG.THOUGHT;
  const Icon = cfg.icon;
  const tool = entry.level === "ACTION" ? extractTool(entry.content) : null;
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className={cn("flex gap-2 rounded px-2 py-1.5 font-mono text-xs", cfg.bg)}>
      <span className="shrink-0 text-zinc-600">{time}</span>
      <Icon className={cn("mt-px h-3 w-3 shrink-0", cfg.color)} />
      <span
        className={cn("w-10 shrink-0 text-[10px] font-semibold uppercase tracking-widest", cfg.color)}
      >
        {cfg.label}
      </span>
      {tool ? (
        <span className="shrink-0 rounded border border-cyan-800/60 bg-cyan-950/40 px-1 text-cyan-300">
          {tool}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-zinc-300">{entry.content}</span>
      {entry.duration_ms !== null ? (
        <span className="shrink-0 text-zinc-600">{entry.duration_ms}ms</span>
      ) : null}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex gap-2 px-2 py-1.5 animate-pulse">
      <div className="h-3 w-14 rounded bg-zinc-800" />
      <div className="h-3 w-3 rounded bg-zinc-800" />
      <div className="h-3 w-8 rounded bg-zinc-800" />
      <div className="h-3 flex-1 rounded bg-zinc-800" />
    </div>
  );
}

export function CycleFeed() {
  const topRef = useRef<HTMLDivElement>(null);

  const logsQuery = useQuery({
    queryKey: ["brain", "logs", "feed"],
    queryFn: () => api.brain.logs({ limit: 80 }),
    refetchInterval: 5_000,
    staleTime: 5_000,
  });

  const entries = logsQuery.data ?? [];

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Cycle Feed
        </span>
        <div className="flex items-center gap-2">
          {logsQuery.isFetching ? (
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          ) : null}
          <span className="font-mono text-xs text-zinc-600">{entries.length} entries</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-2 py-2">
        <div ref={topRef} />

        {logsQuery.isLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : logsQuery.isError ? (
          <div className="rounded border border-red-800/50 bg-red-950/20 p-3 font-mono text-xs text-red-400">
            Failed to load cycle feed — backend may be offline.
          </div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-center font-mono text-xs text-zinc-600">
            No cycle activity yet. Morgoth is idle.
          </div>
        ) : (
          <div className="space-y-0.5">
            {[...entries].reverse().map((entry) => (
              <LogRow key={entry.log_id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
