"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AgentList } from "@/components/agents/AgentList";
import { AgentLogDrawer } from "@/components/agents/AgentLogDrawer";
import { CreateAgentModal } from "@/components/agents/CreateAgentModal";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { api } from "@/lib/api";
import { useAgents } from "@/hooks/useAgents";
import { useAgentsStore } from "@/lib/store/agents.store";
import { useBrainStore } from "@/lib/store/brain.store";
import type { Agent, CreateAgentPayload } from "@/types/morgoth";

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const { agentsQuery, createAgentMutation } = useAgents();
  const agents = useAgentsStore((state) => state.agents);
  const logs = useBrainStore((state) => state.logs);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const stopAgentMutation = useMutation({
    mutationFn: (agentId: string) => api.agents.delete(agentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  function handleCreate(payload: CreateAgentPayload) {
    createAgentMutation.mutate(payload);
  }

  function handleViewLogs(agent: Agent) {
    setSelectedAgent(agent);
    setDrawerOpen(true);
  }

  return (
    <PageWrapper className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-textPrimary">Agents</h1>
          <p className="text-sm text-textSecondary">Monitor live workers, create new ones, and inspect filtered logs.</p>
        </div>
        <CreateAgentModal onCreate={handleCreate} pending={createAgentMutation.isPending} />
      </div>
      <AgentList
        agents={agents.filter((agent) => agent.status !== "completed")}
        isLoading={agentsQuery.isLoading}
        isError={agentsQuery.isError}
        onViewLogs={handleViewLogs}
        onStop={(agent) => stopAgentMutation.mutate(agent.agent_id)}
        stoppingAgentId={stopAgentMutation.variables ?? null}
      />
      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm uppercase tracking-[0.16em] text-textMuted">
          Completed / Stopped agents
        </summary>
        <div className="mt-4">
          <AgentList
            agents={agents.filter((agent) => agent.status === "completed")}
            isLoading={false}
            isError={false}
            onViewLogs={handleViewLogs}
            onStop={() => undefined}
            stoppingAgentId={null}
          />
        </div>
      </details>
      <AgentLogDrawer agent={selectedAgent} logs={logs} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </PageWrapper>
  );
}
