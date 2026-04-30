"use client";

import { useMemo, useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { AgentGrid } from "@/components/warroom/AgentGrid";
import { AgentLogDrawer } from "@/components/warroom/AgentLogDrawer";
import { CreateAgentModal } from "@/components/warroom/CreateAgentModal";
import { MissionFeed } from "@/components/warroom/MissionFeed";
import { useAgents } from "@/hooks/useAgents";
import { useAgentsStore } from "@/lib/store/agents.store";
import { useBrainStore } from "@/lib/store/brain.store";
import type { Agent } from "@/types/morgoth";

export default function WarRoomPage() {
  const { agentsQuery, createAgentMutation, deleteAgentMutation } = useAgents();
  const agents = useAgentsStore((state) => state.agents);
  const logs = useBrainStore((state) => state.logs);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const availableTools = useMemo(
    () => Array.from(new Set(agents.flatMap((agent) => agent.tools))).filter(Boolean),
    [agents],
  );

  function handleViewLogs(agent: Agent) {
    setSelectedAgent(agent);
    setDrawerOpen(true);
  }

  function handleStop(agent: Agent) {
    deleteAgentMutation.mutate(agent.agent_id);
  }

  return (
    <PageWrapper className="space-y-6">
      <div className="flex justify-end">
        <CreateAgentModal
          availableTools={availableTools}
          pending={createAgentMutation.isPending}
          onCreate={(payload) => createAgentMutation.mutate(payload)}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <AgentGrid
          agents={agents}
          isLoading={agentsQuery.isLoading}
          stoppingId={deleteAgentMutation.isPending ? deleteAgentMutation.variables ?? null : null}
          onViewLogs={handleViewLogs}
          onStop={handleStop}
        />
        <MissionFeed logs={logs} />
      </div>
      <AgentLogDrawer agent={selectedAgent} logs={logs} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </PageWrapper>
  );
}
