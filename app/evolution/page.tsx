"use client";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { CapabilityList } from "@/components/evolution/CapabilityList";
import { EvolutionTimeline } from "@/components/evolution/EvolutionTimeline";
import { GrowthMetrics } from "@/components/evolution/GrowthMetrics";
import { SelfModifyLog } from "@/components/evolution/SelfModifyLog";
import { useSelfModifications } from "@/hooks/useSelfModifications";
import { useAgentsStore } from "@/lib/store/agents.store";
import { useBrainStore } from "@/lib/store/brain.store";

export default function EvolutionPage() {
  const { metricsQuery, timelineQuery, selfModificationsQuery } = useSelfModifications();
  const selfModifications = useBrainStore((state) => state.selfModifications);
  const agents = useAgentsStore((state) => state.agents);

  return (
    <PageWrapper className="space-y-6">
      <GrowthMetrics metrics={metricsQuery.data} isLoading={metricsQuery.isLoading} />
      <EvolutionTimeline points={timelineQuery.data ?? []} isLoading={timelineQuery.isLoading} />
      <SelfModifyLog items={selfModifications} isLoading={selfModificationsQuery.isLoading} />
      <CapabilityList selfModifications={selfModifications} agents={agents} />
    </PageWrapper>
  );
}
