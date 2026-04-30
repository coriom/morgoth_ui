"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Agent, SelfModification } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

interface CapabilityItem {
  kind: "TOOL" | "AGENT";
  name: string;
  description: string;
  timestamp: string;
}

function buildCapabilities(selfModifications: SelfModification[], agents: Agent[]): CapabilityItem[] {
  const toolItems = selfModifications
    .filter((item) => item.file_path.startsWith("tools/"))
    .map((item) => ({
      kind: "TOOL" as const,
      name: item.file_path.split("/").pop() ?? item.file_path,
      description: item.reason,
      timestamp: item.timestamp,
    }));

  const agentItems = agents.map((agent) => ({
    kind: "AGENT" as const,
    name: agent.name,
    description: agent.current_task ?? "Agent created",
    timestamp: agent.created_at,
  }));

  return [...toolItems, ...agentItems].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
}

export function CapabilityList({
  selfModifications,
  agents,
}: {
  selfModifications: SelfModification[];
  agents: Agent[];
}) {
  const items = buildCapabilities(selfModifications, agents);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Capability Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No tools or agents have been recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={`${item.kind}-${item.name}-${index}`} className="rounded-lg border border-border bg-surface2/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="rounded-full border border-border px-2 py-1 font-mono text-xs text-textSecondary">{item.kind}</span>
                  <span className="font-mono text-xs text-textMuted">{formatTimestamp(item.timestamp)}</span>
                </div>
                <p className="text-sm font-semibold text-textPrimary">{item.name}</p>
                <p className="mt-1 text-sm text-textSecondary">{item.description}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
