"use client";

import type { LogEntry } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LEARNING_SIGNALS = ["research", "search", "recall", "learn", "news", "knowledge"];

export function LearningFeed({ logs }: { logs: LogEntry[] }) {
  const items = logs.filter(
    (log) =>
      log.level === "ACTION" &&
      LEARNING_SIGNALS.some((signal) => log.content.toLowerCase().includes(signal)),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Learning Feed</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-5 text-sm text-textSecondary">
            No active learning actions are visible yet.
          </div>
        ) : (
          <div className="space-y-3">
            {items.slice(0, 8).map((item) => (
              <div key={item.log_id} className="rounded-lg border border-border bg-surface2/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs text-textMuted">
                  <span className="font-mono">{formatTimestamp(item.timestamp)}</span>
                  <span className="font-mono">{item.agent}</span>
                </div>
                <p className="text-sm text-textPrimary">{item.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
