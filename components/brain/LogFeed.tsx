"use client";

import { Download } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { LogEntry as LogEntryType } from "@/types/morgoth";
import { LogEntry } from "@/components/brain/LogEntry";

export function LogFeed({
  logs,
  connected,
  autoScroll,
  setAutoScroll,
}: {
  logs: LogEntryType[];
  connected: boolean;
  autoScroll: boolean;
  setAutoScroll: (value: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [autoScroll, logs]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "brain-logs.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const header = "timestamp,level,agent,content";
    const rows = logs.map((log) =>
      [log.timestamp, log.level, log.agent, `"${log.content.replaceAll('"', '""')}"`].join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "brain-logs.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-textSecondary">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-result animate-pulse-glow" : "bg-error"}`} />
            Live
          </div>
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className="rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary"
          >
            Auto-scroll {autoScroll ? "On" : "Off"}
          </button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={exportJson}>
            <Download className="h-4 w-4" />
            JSON
          </Button>
          <Button size="sm" variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="max-h-[620px] space-y-2 overflow-y-auto pr-2">
        {logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No logs match the current filters.
          </div>
        ) : (
          logs.map((entry) => <LogEntry key={entry.log_id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
