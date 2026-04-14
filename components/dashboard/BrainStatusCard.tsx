import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BrainStatus } from "@/types/morgoth";

function BrainStatusSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-1/2 rounded bg-surface2" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-lg border border-border bg-surface2/40 p-3">
            <div className="h-3 w-1/2 rounded bg-surface2" />
            <div className="h-5 w-2/3 rounded bg-surface2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BrainStatusCard({
  status,
  isLoading,
  isError,
}: {
  status: BrainStatus | null;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Brain Status</CardTitle>
          <p className="mt-1 text-sm text-textSecondary">Backend readiness and active runtime model configuration.</p>
        </div>
        <Badge variant={status?.ready ? "running" : "failed"}>
          {status?.ready ? "READY" : "NOT READY"}
        </Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? <BrainStatusSkeleton /> : null}
        {!isLoading && isError ? (
          <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
            Brain status could not be loaded.
          </div>
        ) : null}
        {!isLoading && !isError && status ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface2/40 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Primary Model</p>
              <p className="mt-2 font-mono text-sm text-textPrimary">{status.primary_model}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface2/40 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Agent Model</p>
              <p className="mt-2 font-mono text-sm text-textPrimary">{status.agent_model}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface2/40 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Max Concurrent Agents</p>
              <p className="mt-2 font-mono text-xl text-textPrimary">{status.max_concurrent_agents}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface2/40 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Backend State</p>
              <p className="mt-2 font-mono text-xl text-textPrimary">{status.ready ? "Operational" : "Starting"}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
