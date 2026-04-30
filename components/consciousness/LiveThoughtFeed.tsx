"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConsciousnessStore } from "@/lib/store/consciousness.store";
import type { ThoughtEntry as ThoughtEntryType } from "@/types/morgoth";

import { ThoughtEntry } from "./ThoughtEntry";

function isOlderThanFiveMinutes(timestamp: string): boolean {
  return Date.now() - new Date(timestamp).getTime() > 5 * 60 * 1000;
}

export function LiveThoughtFeed({
  thoughts,
  isLoading,
}: {
  thoughts: ThoughtEntryType[];
  isLoading: boolean;
}) {
  const selectedTopic = useConsciousnessStore((state) => state.selectedTopic);
  const setSelectedTopic = useConsciousnessStore((state) => state.setSelectedTopic);
  const [search, setSearch] = useState("");

  const filteredThoughts = useMemo(() => {
    return thoughts.filter((entry) => {
      const topicMatch = !selectedTopic || entry.topic === selectedTopic;
      const searchMatch =
        search.trim().length === 0 ||
        entry.content.toLowerCase().includes(search.toLowerCase()) ||
        entry.topic.toLowerCase().includes(search.toLowerCase());
      return topicMatch && searchMatch;
    });
  }, [search, selectedTopic, thoughts]);

  return (
    <Card className="flex h-full min-h-[24rem] flex-col">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Live Thought Feed</CardTitle>
          {selectedTopic ? (
            <button
              type="button"
              onClick={() => setSelectedTopic(null)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface2 px-2 py-1 font-mono text-xs text-textSecondary"
            >
              {selectedTopic}
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textMuted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search thoughts or topics"
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-lg border border-border bg-surface2/50" />
            ))}
          </div>
        ) : filteredThoughts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No thought events match the current filters yet.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredThoughts.map((entry) => (
              <ThoughtEntry key={entry.id} entry={entry} faded={isOlderThanFiveMinutes(entry.timestamp)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
