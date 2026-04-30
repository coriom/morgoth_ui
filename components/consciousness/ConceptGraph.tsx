"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConceptGraph as ConceptGraphType } from "@/types/morgoth";

export function ConceptGraph({
  graph,
  isLoading,
}: {
  graph: ConceptGraphType;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(true);

  const nodes = useMemo(() => {
    const total = Math.max(graph.nodes.length, 1);
    return graph.nodes.map((node, index) => {
      const angle = (index / total) * Math.PI * 2;
      return {
        ...node,
        x: 320 + Math.cos(angle) * 210,
        y: 140 + Math.sin(angle) * 85,
      };
    });
  }, [graph.nodes]);

  const nodeById = useMemo(
    () =>
      nodes.reduce<Record<string, (typeof nodes)[number]>>((accumulator, node) => {
        accumulator[node.id] = node;
        return accumulator;
      }, {}),
    [nodes],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Concept Graph</CardTitle>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-2 text-sm text-textSecondary transition hover:text-textPrimary"
        >
          {open ? "Collapse" : "Expand"}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </CardHeader>
      {open ? (
        <CardContent>
          {isLoading ? (
            <div className="h-56 animate-pulse rounded-xl border border-border bg-surface2/50" />
          ) : graph.nodes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
              No concept associations are available yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface2/20">
              <svg viewBox="0 0 640 280" className="h-56 w-full">
                {graph.edges.map((edge) => {
                  const source = nodeById[edge.source];
                  const target = nodeById[edge.target];
                  if (!source || !target) {
                    return null;
                  }
                  return (
                    <line
                      key={`${edge.source}-${edge.target}`}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="rgba(148,163,184,0.35)"
                      strokeWidth={Math.max(edge.weight, 1)}
                    />
                  );
                })}
                {nodes.map((node) => (
                  <g key={node.id}>
                    <circle cx={node.x} cy={node.y} r={10 + node.weight * 1.5} fill="rgba(124,58,237,0.75)" />
                    <text x={node.x} y={node.y + 28} textAnchor="middle" className="fill-slate-200 font-mono text-[10px]">
                      {node.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
