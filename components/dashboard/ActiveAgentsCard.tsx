import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Agent } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

function statusVariant(status: Agent["status"]): "running" | "idle" | "paused" | "failed" | "default" {
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

function ActiveAgentsSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-surface2/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="h-4 w-1/3 rounded bg-surface2" />
            <div className="h-4 w-16 rounded bg-surface2" />
          </div>
          <div className="h-3 w-1/2 rounded bg-surface2" />
        </div>
      ))}
    </div>
  );
}

export function ActiveAgentsCard({
  agents,
  isLoading,
  isError,
}: {
  agents: Agent[];
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Agents</CardTitle>
        <p className="text-sm text-textSecondary">Running, paused, and recently completed agent activity.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? <ActiveAgentsSkeleton /> : null}
        {!isLoading && isError ? (
          <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
            Agents could not be loaded.
          </div>
        ) : null}
        {!isLoading && !isError && agents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-textSecondary">
            No agents are registered yet.
          </div>
        ) : null}
        {!isLoading && !isError && agents.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {agents.slice(0, 6).map((agent) => (
              <div key={agent.agent_id} className="rounded-lg border border-border bg-surface2/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-sans text-sm font-semibold text-textPrimary">{agent.name}</p>
                    <p className="font-mono text-xs text-textSecondary">{agent.model}</p>
                  </div>
                  <Badge variant={statusVariant(agent.status)}>{agent.status}</Badge>
                </div>
                <p className="mt-3 text-sm text-textSecondary">{agent.current_task ?? "Awaiting task assignment."}</p>
                <p className="mt-3 font-mono text-xs text-textMuted">{formatTimestamp(agent.created_at)}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
