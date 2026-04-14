import type { Task } from "@/types/morgoth";

import { TaskCard } from "@/components/brain/TaskCard";

const LANES = [
  { priority: 0, label: "CRITICAL" },
  { priority: 1, label: "HIGH" },
  { priority: 2, label: "NORMAL" },
  { priority: 3, label: "BACKGROUND" },
] as const;

export function TaskQueue({ tasks, isLoading }: { tasks: Task[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-4">
        {LANES.map((lane) => (
          <div key={lane.label} className="animate-pulse rounded-lg border border-border bg-surface p-5">
            <div className="mb-4 h-4 w-1/2 rounded bg-surface2" />
            <div className="h-32 rounded bg-surface2" />
          </div>
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
        No tasks in queue — Morgoth is idle.
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {LANES.map((lane) => {
        const laneTasks = tasks.filter((task) => task.priority === lane.priority);
        return (
          <div key={lane.label} className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-4 text-sm uppercase tracking-[0.16em] text-textMuted">{lane.label}</h3>
            <div className="space-y-3">
              {laneTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-textSecondary">
                  No tasks
                </div>
              ) : (
                laneTasks.map((task) => <TaskCard key={task.task_id} task={task} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
