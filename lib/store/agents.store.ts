import { create } from "zustand";

import type { Agent } from "@/types/morgoth";

interface AgentsStore {
  agents: Agent[];
  selectedAgentId: string | null;
  setAgents: (agents: Agent[]) => void;
  upsertAgent: (agent: Agent) => void;
  updateAgent: (id: string, update: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
  setSelectedAgentId: (id: string | null) => void;
}

export const useAgentsStore = create<AgentsStore>((set) => ({
  agents: [],
  selectedAgentId: null,
  setAgents: (agents) => set({ agents }),
  upsertAgent: (agent) =>
    set((state) => {
      const existing = state.agents.find((item) => item.agent_id === agent.agent_id);
      if (!existing) {
        return { agents: [agent, ...state.agents] };
      }
      return {
        agents: state.agents.map((item) => (item.agent_id === agent.agent_id ? agent : item)),
      };
    }),
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
