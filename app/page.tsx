"use client";

import { ActiveAgentsCard } from "@/components/dashboard/ActiveAgentsCard";
import { AlertsFeed } from "@/components/dashboard/AlertsFeed";
import { BrainStatusCard } from "@/components/dashboard/BrainStatusCard";
import { MarketOverviewCard } from "@/components/dashboard/MarketOverviewCard";
import { RecentLogsCard } from "@/components/dashboard/RecentLogsCard";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useAgents } from "@/hooks/useAgents";
import { useBrainStatus } from "@/hooks/useBrainStatus";
import { useMarketData } from "@/hooks/useMarketData";
import { useAgentsStore } from "@/lib/store/agents.store";
import { useBrainStore } from "@/lib/store/brain.store";
import { useMarketStore } from "@/lib/store/market.store";

export default function DashboardPage() {
  const { statusQuery } = useBrainStatus();
  const { agentsQuery } = useAgents();
  const { pricesQuery } = useMarketData();
  const status = useBrainStore((state) => state.status);
  const logs = useBrainStore((state) => state.logs);
  const agents = useAgentsStore((state) => state.agents);
  const prices = useMarketStore((state) => Object.values(state.prices));

  return (
    <PageWrapper className="grid gap-6 xl:grid-cols-[1.2fr_1.2fr_0.9fr]">
      <div className="space-y-6 xl:col-span-2">
        <div className="grid gap-6 lg:grid-cols-2">
          <BrainStatusCard
            status={status}
            isLoading={statusQuery.isLoading}
            isError={statusQuery.isError}
          />
          <MarketOverviewCard
            prices={prices}
            isLoading={pricesQuery.isLoading}
            isError={pricesQuery.isError}
          />
        </div>
        <ActiveAgentsCard
          agents={agents}
          isLoading={agentsQuery.isLoading}
          isError={agentsQuery.isError}
        />
        <RecentLogsCard logs={logs} />
      </div>
      <AlertsFeed alerts={logs.filter((log) => log.level === "ERROR" || log.level === "SYSTEM")} />
    </PageWrapper>
  );
}
