"use client";

import type { LogEntry } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MissionFeed({ logs }: { logs: LogEntry[] }) {
  const items = logs.filter((log) => log.level === "ACTION" || log.level === "RESULT").slice(0, 20);

  return (
    <Card className="h-full min-h-[28rem]">
      <CardHeader>
        <CardTitle className="text-base">Mission Feed</CardTitle>
      </CardHeader>
      <CardContent className="h-full overflow-y-auto">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No agent mission activity is visible yet.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.log_id} className="rounded-lg border border-border bg-surface2/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-background/70 px-2 py-1 font-mono text-[11px] text-textSecondary">
                    {item.agent}
                  </span>
                  <span className="font-mono text-[11px] text-textMuted">{formatTimestamp(item.timestamp)}</span>
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
