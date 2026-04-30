"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KnowledgeDomain } from "@/types/morgoth";

const DOMAIN_FILL = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#6b7280"];

export function KnowledgeMap({
  domains,
  isLoading,
}: {
  domains: KnowledgeDomain[];
  isLoading: boolean;
}) {
  return (
    <Card className="min-h-[32rem]">
      <CardHeader>
        <CardTitle className="text-base">Knowledge Map</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[26rem] animate-pulse rounded-xl border border-border bg-surface2/50" />
        ) : domains.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-textSecondary">
            No persisted knowledge domains are available yet. The Mind page is ready for them when the backend exposes knowledge structure data.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface2/20">
            <svg viewBox="0 0 520 420" className="h-[26rem] w-full">
              <circle cx="260" cy="210" r="42" fill="#7c3aed" fillOpacity="0.9" />
              <text x="260" y="214" textAnchor="middle" className="fill-white font-mono text-xs uppercase tracking-[0.18em]">
                Morgoth
              </text>
              {domains.map((domain, index) => {
                const angle = (index / domains.length) * Math.PI * 2;
                const x = 260 + Math.cos(angle) * 135;
                const y = 210 + Math.sin(angle) * 135;
                return (
                  <g key={domain.domain}>
                    <line x1="260" y1="210" x2={x} y2={y} stroke="rgba(148,163,184,0.35)" strokeWidth="2" />
                    <circle
                      cx={x}
                      cy={y}
                      r={18 + Math.min(domain.fact_count * 1.4, 26)}
                      fill={DOMAIN_FILL[index % DOMAIN_FILL.length]}
                      fillOpacity={Math.max(domain.confidence, 0.35)}
                    />
                    <text x={x} y={y + 38} textAnchor="middle" className="fill-slate-200 font-mono text-[10px]">
                      {domain.domain}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
