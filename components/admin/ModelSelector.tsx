"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ModelSelector() {
  const modelsQuery = useQuery({
    queryKey: ["admin", "models"],
    queryFn: api.admin.models,
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const start = performance.now();
      await api.brain.status();
      return Math.round(performance.now() - start);
    },
  });

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-textPrimary">Model Configuration</h2>
          <p className="text-sm text-textSecondary">
            Current runtime models exposed by the backend. This backend does not implement model update endpoints yet.
          </p>
        </div>
        <Button variant="secondary" onClick={() => testConnectionMutation.mutate()} disabled={testConnectionMutation.isPending}>
          {testConnectionMutation.isPending ? "Testing..." : "Test Connection"}
        </Button>
      </div>
      {modelsQuery.isLoading ? <div className="h-40 animate-pulse rounded-lg bg-surface2" /> : null}
      {modelsQuery.isError ? (
        <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
          Model information could not be loaded.
        </div>
      ) : null}
      {!modelsQuery.isLoading && !modelsQuery.isError && modelsQuery.data ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface2/30 p-4">
            <p className="text-sm text-textSecondary">Primary Model</p>
            <p className="mt-2 font-mono text-textPrimary">{modelsQuery.data.primary_model}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface2/30 p-4">
            <p className="text-sm text-textSecondary">Agent Model</p>
            <p className="mt-2 font-mono text-textPrimary">{modelsQuery.data.agent_model}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface2/30 p-4">
            <p className="text-sm text-textSecondary">Max Concurrent Agents</p>
            <p className="mt-2 font-mono text-textPrimary">{modelsQuery.data.max_concurrent_agents}</p>
          </div>
        </div>
      ) : null}
      {testConnectionMutation.data !== undefined ? (
        <p className="mt-4 text-sm text-textSecondary">
          Backend status latency: <span className="font-mono text-textPrimary">{testConnectionMutation.data} ms</span>
        </p>
      ) : null}
    </div>
  );
}
