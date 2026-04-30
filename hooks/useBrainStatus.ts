"use client";

import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useBrainStore } from "@/lib/store/brain.store";

export function useBrainStatus() {
  const statusQuery = useQuery({
    queryKey: ["brain", "status"],
    queryFn: api.brain.status,
    refetchInterval: 5000,
  });

  const logsQuery = useQuery({
    queryKey: ["brain", "logs"],
    queryFn: () => api.brain.logs({}),
    refetchInterval: 10000,
  });

  const tasksQuery = useQuery({
    queryKey: ["brain", "tasks"],
    queryFn: api.brain.tasks,
    refetchInterval: 10000,
  });

  const statusData = statusQuery.data;
  const logsData = logsQuery.data;
  const tasksData = tasksQuery.data;

  useEffect(() => {
    if (statusData) {
      useBrainStore.getState().setStatus(statusData);
    }
  }, [statusData]);

  useEffect(() => {
    if (logsData) {
      useBrainStore.getState().setLogs(logsData);
    }
  }, [logsData]);

  useEffect(() => {
    if (tasksData) {
      useBrainStore.getState().setTasks(tasksData);
    }
  }, [tasksData]);
  return {
    statusQuery,
    logsQuery,
    tasksQuery,
  };
}
