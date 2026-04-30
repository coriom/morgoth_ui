"use client";

import type { Agent, LogEntry } from "@/types/morgoth";

import { AgentLogDrawer as LegacyAgentLogDrawer } from "@/components/agents/AgentLogDrawer";

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
  return <LegacyAgentLogDrawer agent={agent} logs={logs} open={open} onOpenChange={onOpenChange} />;
}
