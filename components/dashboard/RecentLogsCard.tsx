import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LogEntry } from "@/types/morgoth";
import { levelToColor } from "@/lib/utils/colors";
import { formatTimestamp } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function RecentLogsCard({ logs }: { logs: LogEntry[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Recent Logs</CardTitle>
        <p className="text-sm text-textSecondary">Last ten events from the realtime event bus.</p>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-textSecondary">
            No logs received yet.
          </div>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 10).map((log) => (
              <div
                key={log.log_id}
                className={cn(
                  "rounded-r-lg border border-border bg-surface2/30 p-3 font-mono text-xs text-textSecondary",
                  "border-l-[3px]",
                  levelToColor(log.level),
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span>{log.level}</span>
                  <span>{formatTimestamp(log.timestamp)}</span>
                </div>
                <p className="truncate text-textPrimary">{log.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
