"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Agent } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

function statusVariant(status: Agent["status"]): "running" | "idle" | "failed" | "paused" | "default" {
  switch (status) {
    case "running":
      return "running";
    case "idle":
    case "completed":
      return "idle";
    case "paused":
      return "paused";
    case "failed":
      return "failed";
    default:
      return "default";
  }
}

function formatUptimeLabel(createdAt: string): string {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.max(Math.floor(elapsedMs / 60000), 0);
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function AgentCard({
  agent,
  onViewLogs,
  onStop,
  stopping,
}: {
  agent: Agent;
  onViewLogs: () => void;
  onStop: () => void;
  stopping: boolean;
}) {
  return (
    <Card className="h-full border-border/80">
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-textPrimary">{agent.name}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={statusVariant(agent.status)}>{agent.status}</Badge>
              <Badge>{agent.agent_type.toUpperCase()}</Badge>
            </div>
          </div>
          <p className="rounded-full border border-border px-2 py-1 font-mono text-xs text-textSecondary">{agent.model}</p>
        </div>
        <div className="mt-4 space-y-2">
          <p className="line-clamp-2 text-sm text-textSecondary">{agent.current_task ?? "Awaiting mission assignment."}</p>
          <div className="grid gap-1 text-xs text-textMuted">
            <p className="font-mono">Created {formatTimestamp(agent.created_at)}</p>
            <p className="font-mono">Uptime {formatUptimeLabel(agent.created_at)}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onViewLogs}>
            View Logs
          </Button>
          {agent.agent_type === "persistent" ? (
            <Button variant="destructive" className="flex-1" disabled={stopping} onClick={onStop}>
              {stopping ? "Stopping" : "Stop"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
