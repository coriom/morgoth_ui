"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvolutionMetrics } from "@/types/morgoth";
import { formatCompactNumber } from "@/lib/utils/format";

const METRIC_ITEMS: Array<{ key: keyof EvolutionMetrics; label: string }> = [
  { key: "self_modifications", label: "Self-Modifications" },
  { key: "tools_created", label: "Tools Created" },
  { key: "agents_spawned", label: "Agents Spawned" },
  { key: "knowledge_nodes", label: "Knowledge Nodes" },
];

export function GrowthMetrics({
  metrics,
  isLoading,
}: {
  metrics: EvolutionMetrics | undefined;
  isLoading: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {METRIC_ITEMS.map((item) => (
        <Card key={item.key}>
          <CardHeader>
            <CardTitle>{item.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-10 animate-pulse rounded bg-surface2/60" />
            ) : (
              <p className="font-mono text-3xl text-textPrimary">{formatCompactNumber(metrics?.[item.key] ?? 0)}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
