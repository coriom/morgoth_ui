"use client";

import Link from "next/link";

import { useAgentsStore } from "@/lib/store/agents.store";
import { useBrainStore } from "@/lib/store/brain.store";
import { cn } from "@/lib/utils/cn";

function connectionClasses(status: string): string {
  if (status === "CONNECTED") {
    return "text-result";
  }

  if (status === "RECONNECTING") {
    return "text-system";
  }

  return "text-error";
}

export function TopBar() {
  const status = useBrainStore((state) => state.status);
  const connectionStatus = useBrainStore((state) => state.connectionStatus);
  const reconnectAttempt = useBrainStore((state) => state.reconnectAttempt);
  const agents = useAgentsStore((state) => state.agents);

  const runningAgents = agents.filter((agent) => agent.status === "running").length;
  const model = status?.primary_model ?? "unknown";

  return (
    <header className="flex h-12 items-center gap-4 border-b border-border bg-surface px-6">
      <div className="font-mono text-sm font-semibold uppercase tracking-[0.24em] text-primary">Morgoth</div>
      <div className="flex-1" />
      <Link href="/admin" className="text-xs text-textSecondary transition hover:text-textPrimary">
        Model: <span className="font-mono text-textPrimary">{model}</span>
      </Link>
      <div className="text-xs text-textSecondary">
        Ready: <span className="font-mono text-textPrimary">{status?.ready ? "yes" : "no"}</span>
      </div>
      <div className="text-xs text-textSecondary">
        Agents:{" "}
        <span className="font-mono text-textPrimary">
          {runningAgents}/{agents.length}
        </span>
      </div>
      <div className={cn("flex items-center gap-2 text-xs font-semibold", connectionClasses(connectionStatus))}>
        <span className={cn("h-2 w-2 rounded-full bg-current", connectionStatus === "CONNECTED" && "animate-pulse-glow")} />
        {connectionStatus}
        {connectionStatus === "RECONNECTING" ? ` #${reconnectAttempt}` : ""}
      </div>
      <div className="text-xs text-textSecondary">
        Agent Limit: <span className="font-mono text-textPrimary">{status?.max_concurrent_agents ?? 0}</span>
      </div>
    </header>
  );
}
