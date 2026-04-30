"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConsciousnessStore } from "@/lib/store/consciousness.store";
import type { ThoughtCluster as ThoughtClusterType } from "@/types/morgoth";

import { ThoughtCluster } from "./ThoughtCluster";

const DOMAIN_FILL: Record<ThoughtClusterType["color_domain"], string> = {
  code: "#8b5cf6",
  research: "#06b6d4",
  finance: "#10b981",
  system: "#f59e0b",
  other: "#6b7280",
};

export function ThoughtNebula({
  clusters,
  isLoading,
}: {
  clusters: ThoughtClusterType[];
  isLoading: boolean;
}) {
  const selectedTopic = useConsciousnessStore((state) => state.selectedTopic);
  const setSelectedTopic = useConsciousnessStore((state) => state.setSelectedTopic);

  const nodes = useMemo(() => {
    const total = Math.max(clusters.length, 1);
    return clusters.map((cluster, index) => {
      const angle = (index / total) * Math.PI * 2;
      const radius = 95 + (index % 3) * 35;
      const x = 220 + Math.cos(angle) * radius;
      const y = 180 + Math.sin(angle) * radius;
      const size = 18 + Math.min(cluster.count * 4, 36);
      return { ...cluster, x, y, size };
    });
  }, [clusters]);

  return (
    <Card className="min-h-[28rem]">
      <CardHeader>
        <CardTitle className="text-base">Thought Nebula</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="h-[22rem] animate-pulse rounded-xl border border-border bg-surface2/50" />
        ) : clusters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-textSecondary">
            No thought clusters are available yet. The nebula will emerge as THOUGHT events arrive.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),_transparent_55%),linear-gradient(180deg,_rgba(17,17,24,0.9),_rgba(10,10,15,0.95))]">
              <svg viewBox="0 0 440 360" className="h-[22rem] w-full">
                {nodes.map((node) => (
                  <g key={node.topic}>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.size + 16}
                      fill={DOMAIN_FILL[node.color_domain]}
                      fillOpacity={selectedTopic === node.topic ? 0.24 : 0.1}
                    />
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.size}
                      fill={DOMAIN_FILL[node.color_domain]}
                      fillOpacity={selectedTopic === node.topic ? 0.95 : 0.8}
                      className="cursor-pointer transition"
                      onClick={() => setSelectedTopic(selectedTopic === node.topic ? null : node.topic)}
                    />
                    <text
                      x={node.x}
                      y={node.y + 4}
                      textAnchor="middle"
                      className="fill-white font-mono text-[10px] uppercase tracking-[0.15em]"
                    >
                      {node.topic}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
            <div className="flex flex-wrap gap-3">
              {clusters.map((cluster) => (
                <ThoughtCluster
                  key={cluster.topic}
                  cluster={cluster}
                  active={selectedTopic === cluster.topic}
                  onSelect={setSelectedTopic}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
