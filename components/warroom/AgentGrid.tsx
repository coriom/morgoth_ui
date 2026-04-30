"use client";

import type { Agent } from "@/types/morgoth";

import { AgentCard } from "./AgentCard";

export function AgentGrid({
  agents,
  isLoading,
  stoppingId,
  onViewLogs,
  onStop,
}: {
  agents: Agent[];
  isLoading: boolean;
  stoppingId: string | null;
  onViewLogs: (agent: Agent) => void;
  onStop: (agent: Agent) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-64 animate-pulse rounded-lg border border-border bg-surface2/50" />
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
        No agents are active yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.agent_id}
          agent={agent}
          stopping={stoppingId === agent.agent_id}
          onViewLogs={() => onViewLogs(agent)}
          onStop={() => onStop(agent)}
        />
      ))}
    </div>
  );
}
