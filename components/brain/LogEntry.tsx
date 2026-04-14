import type { LogEntry as LogEntryType } from "@/types/morgoth";
import { levelToColor } from "@/lib/utils/colors";
import { formatTimestamp } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function LogEntry({ entry }: { entry: LogEntryType }) {
  return (
    <div
      className={cn(
        "rounded-r-lg border border-border bg-surface2/30 p-3 font-mono text-xs text-textSecondary",
        "border-l-[3px]",
        levelToColor(entry.level),
      )}
    >
      <div className="mb-1 grid gap-2 md:grid-cols-[120px_90px_140px_1fr]">
        <span>{formatTimestamp(entry.timestamp)}</span>
        <span>{entry.level}</span>
        <span>{entry.agent}</span>
        <span className="truncate text-textPrimary">{entry.content}</span>
      </div>
    </div>
  );
}
