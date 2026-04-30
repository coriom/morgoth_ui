"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SelfModification } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

import { SelfModifyEntry } from "./SelfModifyEntry";

export function SelfModifyLog({
  items,
  isLoading,
}: {
  items: SelfModification[];
  isLoading: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Self-Modification Log</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg border border-border bg-surface2/50" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No self-modification history is available yet.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const expanded = openId === item.mod_id;
              return (
                <div key={item.mod_id} className="rounded-lg border border-border bg-surface2/20">
                  <button
                    type="button"
                    onClick={() => setOpenId(expanded ? null : item.mod_id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="space-y-1">
                      <p className="text-sm text-textPrimary">{item.file_path}</p>
                      <p className="font-mono text-xs text-textMuted">{formatTimestamp(item.timestamp)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={item.test_result?.passed ? "running" : "failed"}>
                        {item.test_result?.passed ? "PASS" : "FAIL"}
                      </Badge>
                      <span className="text-xs text-textSecondary">{expanded ? "Hide Diff" : "Show Diff"}</span>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="border-t border-border px-4 py-4">
                      <SelfModifyEntry entry={item} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
