"use client";

import { useMemo, useState } from "react";

import { LogFeed } from "@/components/brain/LogFeed";
import { LogFilters, type LogFilterState } from "@/components/brain/LogFilters";
import { SelfModifyHistory } from "@/components/brain/SelfModifyHistory";
import { TaskQueue } from "@/components/brain/TaskQueue";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBrainStatus } from "@/hooks/useBrainStatus";
import { useBrainStore } from "@/lib/store/brain.store";

function matchesRange(timestamp: string, range: string): boolean {
  const minutesMap: Record<string, number> = {
    "15m": 15,
    "1h": 60,
    "6h": 360,
    "24h": 1440,
  };

  const windowMinutes = minutesMap[range] ?? 1440;
  return Date.now() - new Date(timestamp).getTime() <= windowMinutes * 60 * 1000;
}

export default function BrainPage() {
  const { tasksQuery, selfModificationsQuery } = useBrainStatus();
  const logs = useBrainStore((state) => state.logs);
  const tasks = useBrainStore((state) => state.tasks);
  const selfModifications = useBrainStore((state) => state.selfModifications);
  const connected = useBrainStore((state) => state.connected);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filters, setFilters] = useState<LogFilterState>({
    levels: ["THOUGHT", "ACTION", "RESULT", "ERROR", "SYSTEM"],
    agent: "ALL",
    range: "24h",
    search: "",
  });

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const levelMatch = filters.levels.includes(log.level);
      const agentMatch = filters.agent === "ALL" || log.agent === filters.agent;
      const rangeMatch = matchesRange(log.timestamp, filters.range);
      const searchMatch = log.content.toLowerCase().includes(filters.search.toLowerCase());
      return levelMatch && agentMatch && rangeMatch && searchMatch;
    });
  }, [filters, logs]);

  const agentOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.agent))), [logs]);

  return (
    <PageWrapper className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-textPrimary">Brain</h1>
        <p className="text-sm text-textSecondary">Inspect logs, task lanes, and self-modification history.</p>
      </div>
      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="queue">Task Queue</TabsTrigger>
          <TabsTrigger value="mods">Self-Modifications</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="space-y-4">
          <LogFilters agents={agentOptions} filters={filters} onChange={setFilters} />
          <LogFeed logs={filteredLogs} connected={connected} autoScroll={autoScroll} setAutoScroll={setAutoScroll} />
        </TabsContent>
        <TabsContent value="queue">
          <TaskQueue tasks={tasks} isLoading={tasksQuery.isLoading} />
        </TabsContent>
        <TabsContent value="mods">
          <SelfModifyHistory items={selfModifications} isLoading={selfModificationsQuery.isLoading} />
        </TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
