import type { LogLevel } from "@/types/morgoth";

export function levelToColor(level: LogLevel): string {
  switch (level) {
    case "THOUGHT":
      return "border-l-thought";
    case "ACTION":
      return "border-l-action";
    case "RESULT":
      return "border-l-result";
    case "ERROR":
      return "border-l-error";
    case "SYSTEM":
      return "border-l-system";
    default:
      return "border-l-border";
  }
}

export function changeToColor(change: number): string {
  if (change > 0) {
    return "text-bullish";
  }

  if (change < 0) {
    return "text-bearish";
  }

  return "text-neutral";
}
