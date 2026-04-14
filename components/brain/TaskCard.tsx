import type { Task } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

export function TaskCard({ task }: { task: Task }) {
  return (
    <div className="rounded-lg border border-border bg-surface2/30 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-textSecondary">{task.task_id.slice(0, 12)}</span>
        <span className="rounded-full bg-primaryGlow px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-textPrimary">
          {task.type}
        </span>
      </div>
      <p className="text-sm text-textPrimary">{task.description}</p>
      <div className="mt-3 space-y-1 font-mono text-xs text-textMuted">
        <p>Created by: {task.created_by}</p>
        <p>Created at: {formatTimestamp(task.created_at)}</p>
        <p>Assigned agent: {task.agent_id ?? "Unassigned"}</p>
      </div>
    </div>
  );
}
