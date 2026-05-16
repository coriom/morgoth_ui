"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { SelfModifyLog } from "@/components/evolution/SelfModifyLog";
import { api } from "@/lib/api";
import { useBrainStore } from "@/lib/store/brain.store";
import { formatCompactNumber } from "@/lib/utils/format";

const METRIC_ITEMS = [
  { key: "self_modifications", label: "Self-Mods", color: "text-violet-400" },
  { key: "tools_created", label: "Tools Created", color: "text-cyan-400" },
  { key: "agents_spawned", label: "Agents Spawned", color: "text-emerald-400" },
  { key: "knowledge_nodes", label: "Knowledge Nodes", color: "text-amber-400" },
] as const;

function NoEvolutionsState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/50 py-16 text-center">
      <GitBranch className="h-10 w-10 text-zinc-700" />
      <div className="space-y-2">
        <p className="font-mono text-sm font-semibold text-zinc-400">No Evolutions Yet</p>
        <p className="max-w-sm text-xs text-zinc-600">
          Morgoth has not yet applied any self-modifications. When it modifies its own code, each
          change will appear here with a diff, test result, and timestamp.
        </p>
        <p className="max-w-sm font-mono text-[10px] text-zinc-700">
          Source: <code>/api/brain/self-modifications</code> · code_archive collection
        </p>
      </div>
    </div>
  );
}

export default function EvolutionPage() {
  const selfModifications = useBrainStore((state) => state.selfModifications);

  const selfModsQuery = useQuery({
    queryKey: ["brain", "self-modifications"],
    queryFn: api.brain.selfModifications,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const metricsQuery = useQuery({
    queryKey: ["evolution", "metrics"],
    queryFn: api.evolution.metrics,
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: 1,
  });

  const selfModsData = selfModsQuery.data;

  useEffect(() => {
    if (selfModsData) {
      useBrainStore.getState().setSelfModifications(selfModsData);
    }
  }, [selfModsData]);

  const metrics = metricsQuery.data;
  const hasNoEvolutions = !selfModsQuery.isLoading && selfModifications.length === 0;

  return (
    <PageWrapper className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Self-Modification Timeline
        </h1>
        <p className="mt-1 text-xs text-zinc-600">
          Every change Morgoth applies to its own code, with diffs and test results.
        </p>
      </div>

      {/* Metrics strip */}
      {(metricsQuery.isLoading || metrics) ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {METRIC_ITEMS.map((item) => (
            <div
              key={item.key}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-3"
            >
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">{item.label}</p>
              {metricsQuery.isLoading ? (
                <div className="mt-1 h-6 w-12 animate-pulse rounded bg-zinc-800" />
              ) : (
                <p className={`mt-1 font-mono text-2xl font-semibold ${item.color}`}>
                  {formatCompactNumber(metrics?.[item.key] ?? 0)}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Self-modification log or empty state */}
      {hasNoEvolutions ? (
        <NoEvolutionsState />
      ) : (
        <SelfModifyLog items={selfModifications} isLoading={selfModsQuery.isLoading} />
      )}
    </PageWrapper>
  );
}
