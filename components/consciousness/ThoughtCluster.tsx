"use client";

import type { ThoughtCluster as ThoughtClusterType } from "@/types/morgoth";

const DOMAIN_STYLE: Record<ThoughtClusterType["color_domain"], string> = {
  code: "border-domainCode/40 bg-domainCode/10 text-domainCode",
  research: "border-domainResearch/40 bg-domainResearch/10 text-domainResearch",
  finance: "border-domainFinance/40 bg-domainFinance/10 text-domainFinance",
  system: "border-system/40 bg-system/10 text-system",
  other: "border-border bg-surface2 text-textSecondary",
};

export function ThoughtCluster({
  cluster,
  active,
  onSelect,
}: {
  cluster: ThoughtClusterType;
  active: boolean;
  onSelect: (topic: string | null) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(active ? null : cluster.topic)}
      className={`rounded-full border px-3 py-2 text-left transition ${
        active ? "scale-[1.02] shadow-glow" : "hover:-translate-y-0.5"
      } ${DOMAIN_STYLE[cluster.color_domain]}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">{cluster.topic}</span>
        <span className="font-mono text-xs">{cluster.count}</span>
      </div>
      <p className="mt-1 max-w-52 truncate text-xs text-textSecondary">{cluster.last_thought}</p>
    </button>
  );
}
