import { create } from "zustand";

import type { Agent } from "@/types/morgoth";

interface AgentsStore {
  agents: Agent[];
  selectedAgentId: string | null;
  setAgents: (agents: Agent[]) => void;
  updateAgent: (id: string, update: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
  setSelectedAgentId: (id: string | null) => void;
}

export const useAgentsStore = create<AgentsStore>((set) => ({
  agents: [],
  selectedAgentId: null,
  setAgents: (agents) => set({ agents }),
  updateAgent: (id, update) =>
    set((state) => ({
      agents: state.agents.map((agent) => (agent.agent_id === id ? { ...agent, ...update } : agent)),
    })),
  removeAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((agent) => agent.agent_id !== id),
    })),
  setSelectedAgentId: (selectedAgentId) => set({ selectedAgentId }),
}));
