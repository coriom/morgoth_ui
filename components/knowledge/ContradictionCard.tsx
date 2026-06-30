"use client";

import { ArrowLeftRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { formatTimestamp } from "@/lib/utils/format";
import type { Contradiction, ContradictionThesis } from "@/types/morgoth";

// Lightweight pole hint for visual marking: down=bearish, up=bullish, else neutral.
// Matches DIRECTION_LEXICON on the backend at a surface level — purely cosmetic.
const DOWN_WORDS = [
  "declining",
  "decreasing",
  "falling",
  "down",
  "weakening",
  "negative",
  "contracting",
  "bearish",
];
const UP_WORDS = [
  "increasing",
  "rising",
  "up",
  "strengthening",
  "positive",
  "expanding",
  "bullish",
];

function claimTone(claim: string | undefined): "bearish" | "bullish" | "neutral" {
  if (!claim) return "neutral";
  const lower = claim.toLowerCase();
  const isDown = DOWN_WORDS.some((w) => lower.includes(w));
  const isUp = UP_WORDS.some((w) => lower.includes(w));
  if (isDown && !isUp) return "bearish";
  if (isUp && !isDown) return "bullish";
  return "neutral";
}

function toneTextClass(tone: "bearish" | "bullish" | "neutral"): string {
  switch (tone) {
    case "bearish":
      return "text-bearish";
    case "bullish":
      return "text-bullish";
    default:
      return "text-textPrimary";
  }
}

function toneBorderClass(tone: "bearish" | "bullish" | "neutral"): string {
  switch (tone) {
    case "bearish":
      return "border-bearish/40";
    case "bullish":
      return "border-bullish/40";
    default:
      return "border-border";
  }
}

function ThesisSide({ thesis }: { thesis: ContradictionThesis | null }) {
  if (!thesis) {
    return (
      <div className="flex h-full min-h-[6rem] flex-col justify-center rounded-lg border border-dashed border-border bg-surface2/30 p-4 text-sm text-textMuted">
        thesis removed
      </div>
    );
  }
  const tone = claimTone(thesis.claim);
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-lg border bg-surface2/40 p-4",
        toneBorderClass(tone),
      )}
    >
      <p className="font-mono text-xs text-textMuted">{thesis.subject}</p>
      <p className={cn("text-sm font-semibold", toneTextClass(tone))}>{thesis.claim}</p>
      <div className="mt-auto flex items-center gap-2">
        <Badge variant={thesis.status === "contradicted" ? "failed" : "default"}>
          {thesis.status}
        </Badge>
        <Badge>{thesis.confidence}</Badge>
      </div>
    </div>
  );
}

export function ContradictionCard({ contradiction }: { contradiction: Contradiction }) {
  return (
    <Card className="border-border/80">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-sm text-textPrimary">
            {contradiction.subject_group ?? "(no subject group)"}
          </p>
          <span className="font-mono text-xs text-textMuted">
            {formatTimestamp(contradiction.detected_at)}
          </span>
        </div>
        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          <ThesisSide thesis={contradiction.thesis_a} />
          <div
            className="flex items-center justify-center text-textMuted md:px-2"
            aria-label="opposes"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </div>
          <ThesisSide thesis={contradiction.thesis_b} />
        </div>
      </CardContent>
    </Card>
  );
}
