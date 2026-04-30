"use client";

import type { ThoughtEntry as ThoughtEntryType, ThoughtColorDomain } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

const DOMAIN_CLASS: Record<ThoughtColorDomain, string> = {
  code: "border-domainCode/70 text-domainCode",
  research: "border-domainResearch/70 text-domainResearch",
  finance: "border-domainFinance/70 text-domainFinance",
  system: "border-system/70 text-system",
  other: "border-thought/70 text-thought",
};

export function ThoughtEntry({ entry, faded }: { entry: ThoughtEntryType; faded?: boolean }) {
  const domain = (["code", "research", "finance", "system"].includes(entry.topic) ? entry.topic : "other") as ThoughtColorDomain;

  return (
    <article
      className={`rounded-lg border-l-2 bg-surface2/50 p-3 transition ${DOMAIN_CLASS[domain]} ${
        faded ? "opacity-60" : "opacity-100"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-textMuted">
        <span className="font-mono">{formatTimestamp(entry.timestamp)}</span>
        <span className="rounded-full bg-background/60 px-2 py-1 font-mono">{entry.topic}</span>
      </div>
      <p className="text-sm text-textPrimary">{entry.content}</p>
      <p className="mt-2 font-mono text-[11px] text-textMuted">{entry.agent}</p>
    </article>
  );
}
