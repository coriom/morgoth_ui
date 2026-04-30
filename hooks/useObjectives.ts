"use client";

import { useEffect } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useMindStore } from "@/lib/store/mind.store";
import type { Objective, ObjectiveCategory, ObjectiveStatus } from "@/types/morgoth";

interface CreateObjectiveInput {
  title: string;
  description: string;
  category: ObjectiveCategory;
  priority: number;
  user_id?: string;
}

interface UpdateObjectiveInput {
  id: string;
  status: ObjectiveStatus;
}

export function useObjectives() {
  const queryClient = useQueryClient();

  const objectivesQuery = useQuery({
    queryKey: ["objectives"],
    queryFn: api.objectives.list,
    refetchInterval: 15000,
  });

  const objectivesData = objectivesQuery.data;

  useEffect(() => {
    if (objectivesData) {
      useMindStore.getState().setObjectives(objectivesData);
    }
  }, [objectivesData]);

  const createObjectiveMutation = useMutation({
    mutationFn: (payload: CreateObjectiveInput) => api.objectives.create(payload),
    onSuccess: (objective: Objective) => {
      useMindStore.getState().setObjectives([objective, ...useMindStore.getState().objectives]);
      void queryClient.invalidateQueries({ queryKey: ["objectives"] });
    },
  });

  const updateObjectiveMutation = useMutation({
    mutationFn: ({ id, status }: UpdateObjectiveInput) => api.objectives.update(id, { status }),
    onSuccess: (objective: Objective) => {
      useMindStore.getState().updateObjective(objective.objective_id, objective);
      void queryClient.invalidateQueries({ queryKey: ["objectives"] });
    },
  });

  return {
    objectivesQuery,
    createObjectiveMutation,
    updateObjectiveMutation,
  };
}
