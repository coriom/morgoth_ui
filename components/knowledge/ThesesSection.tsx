"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, api } from "@/lib/api";

import { ThesisCard } from "./ThesisCard";

const STATUS_OPTIONS = ["all", "active", "contradicted", "stale"] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

export function ThesesSection() {
  const [status, setStatus] = useState<StatusOption>("all");

  const thesesQuery = useQuery({
    queryKey: ["knowledge", "theses", status],
    queryFn: () =>
      api.knowledge.theses(status === "all" ? undefined : { status }),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const theses = thesesQuery.data ?? [];

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-base">Theses</CardTitle>
        <div className="grid gap-3 md:grid-cols-3">
          <Select value={status} onValueChange={(value) => setStatus(value as StatusOption)}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {thesesQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-lg border border-border bg-surface2/50"
              />
            ))}
          </div>
        ) : thesesQuery.isError ? (
          <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
            Failed to load theses
            {thesesQuery.error instanceof ApiError ? `: ${thesesQuery.error.message}` : "."}
          </div>
        ) : theses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No theses yet — Morgoth accumulates beliefs as objectives complete.
          </div>
        ) : (
          <div className="space-y-3">
            {theses.map((thesis) => (
              <ThesisCard key={thesis.thesis_id} thesis={thesis} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
