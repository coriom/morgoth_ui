"use client";

import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LogEntry } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

export function ThoughtStream({ logs }: { logs: LogEntry[] }) {
  const [open, setOpen] = useState(true);

  const thoughts = useMemo(() => {
    const threshold = Date.now() - 30000;
    return logs.filter((log) => log.level === "THOUGHT" && new Date(log.timestamp).getTime() >= threshold);
  }, [logs]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setOpen((value) => !value)}>
          {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {open ? "Hide Thoughts" : "Show Thoughts"}
        </Button>
      </div>
      {open ? (
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Thought Stream</CardTitle>
            <p className="text-sm text-textSecondary">Ambient THOUGHT logs fade out after thirty seconds.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {thoughts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-textSecondary">
                No recent thought events.
              </div>
            ) : (
              thoughts.map((thought) => (
                <div key={thought.log_id} className="rounded-lg border border-border bg-surface2/30 p-3 font-mono text-xs text-thought">
                  <div className="mb-1 flex items-center justify-between gap-3 text-textMuted">
                    <span>THOUGHT</span>
                    <span>{formatTimestamp(thought.timestamp)}</span>
                  </div>
                  <p>{thought.content}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
