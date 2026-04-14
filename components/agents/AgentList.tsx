import type { Agent } from "@/types/morgoth";

import { AgentCard } from "@/components/agents/AgentCard";

function AgentListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-lg border border-border bg-surface p-5">
          <div className="mb-3 h-4 w-1/2 rounded bg-surface2" />
          <div className="mb-2 h-4 w-20 rounded bg-surface2" />
          <div className="h-12 rounded bg-surface2" />
        </div>
      ))}
    </div>
  );
}

export function AgentList({
  agents,
  isLoading,
  isError,
  onViewLogs,
  onStop,
  stoppingAgentId,
}: {
  agents: Agent[];
  isLoading: boolean;
  isError: boolean;
  onViewLogs: (agent: Agent) => void;
  onStop: (agent: Agent) => void;
  stoppingAgentId: string | null;
}) {
  if (isLoading) {
    return <AgentListSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
        Agents could not be loaded.
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
        No agents found. Create one to start monitoring.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.agent_id}
          agent={agent}
          onViewLogs={() => onViewLogs(agent)}
          onStop={() => onStop(agent)}
          stopping={stoppingAgentId === agent.agent_id}
        />
      ))}
    </div>
  );
}
