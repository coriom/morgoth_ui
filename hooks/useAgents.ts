"use client";

import { useEffect } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAgentsStore } from "@/lib/store/agents.store";
import type { CreateAgentPayload } from "@/types/morgoth";

export function useAgents() {
  const queryClient = useQueryClient();

  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents.list,
    refetchInterval: 15000,
  });

  const agentsData = agentsQuery.data;

  useEffect(() => {
    if (agentsData) {
      useAgentsStore.getState().setAgents(agentsData);
    }
  }, [agentsData]);

  const createAgentMutation = useMutation({
    mutationFn: (payload: CreateAgentPayload) => api.agents.create(payload),
    onSuccess: (agent) => {
      useAgentsStore.getState().upsertAgent(agent);
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: (id: string) => api.agents.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  return {
    agentsQuery,
    createAgentMutation,
    deleteAgentMutation,
  };
}
