"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/utils/format";
import type { Thesis, ThesisConfidence, ThesisStatus } from "@/types/morgoth";

function statusVariant(status: ThesisStatus): "default" | "failed" | "idle" {
  switch (status) {
    case "contradicted":
      return "failed";
    case "stale":
      return "idle";
    default:
      return "default";
  }
}

function confidenceVariant(conf: ThesisConfidence): "default" | "success" | "warning" {
  switch (conf) {
    case "high":
      return "success";
    case "low":
      return "warning";
    default:
      return "default";
  }
}

function truncateId(value: string, head = 8): string {
  if (!value) return "";
  return value.length > head ? `${value.slice(0, head)}…` : value;
}

export function ThesisCard({ thesis }: { thesis: Thesis }) {
  return (
    <Card className="border-border/80">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="font-mono text-sm text-textPrimary">{thesis.subject}</p>
            <p className="text-sm text-textSecondary">
              <span className="text-textMuted">claim — </span>
              <span className="font-medium text-textPrimary">{thesis.claim}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge variant={statusVariant(thesis.status)}>{thesis.status}</Badge>
            <Badge variant={confidenceVariant(thesis.confidence)}>{thesis.confidence}</Badge>
          </div>
        </div>
        {thesis.evidence.length > 0 ? (
          <ul className="space-y-1.5 border-l-2 border-border pl-3">
            {thesis.evidence.map((item, index) => (
              <li key={`${thesis.thesis_id}-ev-${index}`} className="font-mono text-xs text-textSecondary">
                <span className="text-textMuted">{item.source}</span>
                <span className="px-1.5 text-textMuted">→</span>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-mono text-xs text-textMuted">no evidence recorded</p>
        )}
        <div className="flex items-center justify-between gap-3 pt-1 text-xs text-textMuted">
          <span className="font-mono">obj {truncateId(thesis.objective_id)}</span>
          <span className="font-mono">{formatTimestamp(thesis.created_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
