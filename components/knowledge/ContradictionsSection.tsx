"use client";

import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, api } from "@/lib/api";

import { ContradictionCard } from "./ContradictionCard";

export function ContradictionsSection() {
  const contradictionsQuery = useQuery({
    queryKey: ["knowledge", "contradictions"],
    queryFn: () => api.knowledge.contradictions(),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const contradictions = contradictionsQuery.data ?? [];

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-base">Contradictions</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {contradictionsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-lg border border-border bg-surface2/50"
              />
            ))}
          </div>
        ) : contradictionsQuery.isError ? (
          <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
            Failed to load contradictions
            {contradictionsQuery.error instanceof ApiError
              ? `: ${contradictionsQuery.error.message}`
              : "."}
          </div>
        ) : contradictions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No contradictions detected — Morgoth has not yet held opposing beliefs on the same
            subject.
          </div>
        ) : (
          <div className="space-y-3">
            {contradictions.map((c) => (
              <ContradictionCard key={c.contradiction_id} contradiction={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
