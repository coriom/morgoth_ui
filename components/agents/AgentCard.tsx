import { Square, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="h-full">
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-textPrimary">{agent.name}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={statusVariant(agent.status)}>{agent.status}</Badge>
              <Badge>{agent.agent_type}</Badge>
            </div>
          </div>
          <Badge>{agent.model}</Badge>
        </div>
        <p className="line-clamp-2 text-sm text-textSecondary">
          {agent.current_task ?? "No current task description available."}
        </p>
        <div className="space-y-2 text-xs text-textMuted">
          <p className="font-mono">Created: {formatTimestamp(agent.created_at)}</p>
          <div className="flex flex-wrap gap-2">
            {agent.tools.length > 0 ? (
              agent.tools.map((tool) => (
                <span key={tool} className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-1 font-mono text-[11px] text-textSecondary">
                  <Terminal className="h-3 w-3" />
                  {tool}
                </span>
              ))
            ) : (
              <span className="text-textSecondary">No tools enabled</span>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onViewLogs}>
            View Logs
          </Button>
          {agent.agent_type === "persistent" ? (
            <Button variant="destructive" className="flex-1" onClick={onStop} disabled={stopping}>
              <Square className="h-4 w-4" />
              {stopping ? "Stopping" : "Stop"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
