import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LogEntry } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

export function AlertsFeed({ alerts }: { alerts: LogEntry[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Alerts Feed</CardTitle>
        <p className="text-sm text-textSecondary">Critical failures and system warnings requiring operator attention.</p>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-textSecondary">
            No critical or warning alerts.
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.slice(0, 8).map((alert) => (
              <div key={alert.log_id} className="rounded-lg border border-border bg-surface2/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className={alert.level === "ERROR" ? "text-error" : "text-system"}>{alert.level}</span>
                  <span className="font-mono text-xs text-textMuted">{formatTimestamp(alert.timestamp)}</span>
                </div>
                <p className="text-sm text-textPrimary">{alert.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
