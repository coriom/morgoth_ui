"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Agent, LogEntry, LogLevel } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

const LOG_LEVELS: Array<LogLevel | "ALL"> = ["ALL", "THOUGHT", "ACTION", "RESULT", "ERROR", "SYSTEM"];

export function AgentLogDrawer({
  agent,
  logs,
  open,
  onOpenChange,
}: {
  agent: Agent | null;
  logs: LogEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [level, setLevel] = useState<LogLevel | "ALL">("ALL");

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const agentMatch = agent ? log.agent === agent.agent_id || log.agent === agent.name : false;
      const levelMatch = level === "ALL" || log.level === level;
      return agentMatch && levelMatch;
    });
  }, [agent, level, logs]);

  function downloadLogs() {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${agent?.agent_id ?? "agent"}-logs.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-textPrimary">{agent?.name ?? "Agent Logs"}</h2>
            <p className="text-sm text-textSecondary">Realtime log stream filtered to a single agent.</p>
          </div>
          <button
            type="button"
            onClick={downloadLogs}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary"
          >
            <Download className="h-4 w-4" />
            Download JSON
          </button>
        </div>
        <div className="mb-4">
          <Select value={level} onValueChange={(value) => setLevel(value as LogLevel | "ALL")}>
            <SelectTrigger className="max-w-48">
              <SelectValue placeholder="Filter level" />
            </SelectTrigger>
            <SelectContent>
              {LOG_LEVELS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3 overflow-y-auto pr-2">
          {filteredLogs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-textSecondary">
              No logs available for this agent and filter.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.log_id} className="rounded-lg border border-border bg-surface2/30 p-3 font-mono text-xs">
                <div className="mb-1 flex items-center justify-between gap-3 text-textMuted">
                  <span>{log.level}</span>
                  <span>{formatTimestamp(log.timestamp)}</span>
                </div>
                <p className="text-textPrimary">{log.content}</p>
              </div>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
