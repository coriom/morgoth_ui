"use client";

import { useQuery } from "@tanstack/react-query";

import { ObjectivesHistogram } from "@/components/dashboard/ObjectivesHistogram";
import { ToolUsageChart } from "@/components/dashboard/ToolUsageChart";
import { TopicsCloud } from "@/components/dashboard/TopicsCloud";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { ObjectivesList } from "@/components/mind/ObjectivesList";
import { api } from "@/lib/api";
import { useMindStore } from "@/lib/store/mind.store";
import type { ObjectiveStatus } from "@/types/morgoth";
import { useObjectives } from "@/hooks/useObjectives";

export default function MindPage() {
  const { objectivesQuery, updateObjectiveMutation } = useObjectives();
  const objectives = useMindStore((state) => state.objectives);

  const logsQuery = useQuery({
    queryKey: ["brain", "logs", "mind"],
    queryFn: () => api.brain.logs({ limit: 500 }),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const logs = logsQuery.data ?? [];

  function handleStatusChange(id: string, status: ObjectiveStatus) {
    updateObjectiveMutation.mutate({ id, status });
  }

  return (
    <PageWrapper className="space-y-4">
      {/* Analytics row */}
      <div className="grid gap-4 xl:grid-cols-2">
        <TopicsCloud logs={logs} isLoading={logsQuery.isLoading} />
        <ObjectivesHistogram objectives={objectives} isLoading={objectivesQuery.isLoading} />
      </div>

      {/* Tool usage chart */}
      <ToolUsageChart logs={logs} isLoading={logsQuery.isLoading} />

      {/* Objectives list — kept from previous design */}
      <div>
        <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400">
          All Objectives
        </h2>
        <ObjectivesList
          objectives={objectives}
          isLoading={objectivesQuery.isLoading}
          pendingId={updateObjectiveMutation.variables?.id ?? null}
          onStatusChange={handleStatusChange}
        />
      </div>
    </PageWrapper>
  );
}
