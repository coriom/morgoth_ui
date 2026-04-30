"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Objective, ObjectiveStatus } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

function statusVariant(status: ObjectiveStatus): "running" | "idle" | "failed" | "default" {
  switch (status) {
    case "in_progress":
      return "running";
    case "completed":
      return "idle";
    case "failed":
    case "blocked":
      return "failed";
    default:
      return "default";
  }
}

function progressWidthClass(status: ObjectiveStatus): string {
  switch (status) {
    case "completed":
      return "w-full";
    case "in_progress":
      return "w-3/5";
    case "failed":
    case "blocked":
      return "w-1/5";
    default:
      return "w-[8%]";
  }
}

export function ObjectiveCard({
  objective,
  onStatusChange,
  pending,
}: {
  objective: Objective;
  onStatusChange?: (status: ObjectiveStatus) => void;
  pending?: boolean;
}) {
  return (
    <Card className="border-border/80">
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-textPrimary">{objective.title}</h3>
            <div className="flex flex-wrap gap-2">
              <Badge>{objective.category}</Badge>
              <Badge variant={statusVariant(objective.status)}>{objective.status}</Badge>
              <Badge>{objective.generated_by}</Badge>
            </div>
          </div>
          <p className="font-mono text-xs text-textMuted">P{objective.priority}</p>
        </div>
        <p className="mt-3 text-sm text-textSecondary">{objective.description}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
          <div className={`h-full rounded-full bg-primary transition-all ${progressWidthClass(objective.status)}`} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-textMuted">
          <span className="font-mono">Created {formatTimestamp(objective.created_at)}</span>
          {onStatusChange ? (
            <div className="flex gap-2">
              {objective.status !== "in_progress" ? (
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => onStatusChange("in_progress")}>
                  Start
                </Button>
              ) : null}
              {objective.status !== "completed" ? (
                <Button size="sm" disabled={pending} onClick={() => onStatusChange("completed")}>
                  Complete
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
