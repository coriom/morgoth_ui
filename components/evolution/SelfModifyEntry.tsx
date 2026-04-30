"use client";

import { Badge } from "@/components/ui/badge";
import type { SelfModification } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

export function SelfModifyEntry({ entry }: { entry: SelfModification }) {
  const passed = entry.test_result?.passed ?? false;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-textMuted">{formatTimestamp(entry.timestamp)}</p>
          <p className="text-sm text-textPrimary">{entry.file_path}</p>
        </div>
        <Badge variant={passed ? "running" : "failed"}>{passed ? "PASS" : "FAIL"}</Badge>
      </div>
      <p className="text-sm text-textSecondary">{entry.reason}</p>
      <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-textSecondary">
        {entry.diff || "No diff captured."}
      </pre>
    </div>
  );
}
