"use client";

import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useBrainStore } from "@/lib/store/brain.store";

export function useSelfModifications() {
  const metricsQuery = useQuery({
    queryKey: ["evolution", "metrics"],
    queryFn: api.evolution.metrics,
    refetchInterval: 30000,
  });

  const timelineQuery = useQuery({
    queryKey: ["evolution", "timeline"],
    queryFn: api.evolution.timeline,
    refetchInterval: 30000,
  });

  const selfModificationsQuery = useQuery({
    queryKey: ["brain", "self-modifications"],
    queryFn: api.brain.selfModifications,
    refetchInterval: 30000,
  });

  const selfModificationsData = selfModificationsQuery.data;

  useEffect(() => {
    if (selfModificationsData) {
      useBrainStore.getState().setSelfModifications(selfModificationsData);
    }
  }, [selfModificationsData]);

  return {
    metricsQuery,
    timelineQuery,
    selfModificationsQuery,
  };
}
