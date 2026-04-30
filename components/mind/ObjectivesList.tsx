"use client";

import { useMemo, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Objective, ObjectiveCategory, ObjectiveStatus } from "@/types/morgoth";

import { ObjectiveCard } from "./ObjectiveCard";

const CATEGORY_OPTIONS: Array<ObjectiveCategory | "all"> = ["all", "research", "capability", "monitoring", "optimization"];
const STATUS_OPTIONS: Array<ObjectiveStatus | "all"> = ["all", "pending", "in_progress", "completed", "failed", "blocked"];

export function ObjectivesList({
  objectives,
  isLoading,
  onStatusChange,
  pendingId,
}: {
  objectives: Objective[];
  isLoading: boolean;
  onStatusChange?: (id: string, status: ObjectiveStatus) => void;
  pendingId?: string | null;
}) {
  const [category, setCategory] = useState<ObjectiveCategory | "all">("all");
  const [status, setStatus] = useState<ObjectiveStatus | "all">("all");

  const filtered = useMemo(() => {
    return objectives.filter((objective) => {
      const categoryMatch = category === "all" || objective.category === category;
      const statusMatch = status === "all" || objective.status === status;
      return categoryMatch && statusMatch;
    });
  }, [category, objectives, status]);

  return (
    <Card className="flex h-full min-h-[28rem] flex-col">
      <CardHeader>
        <CardTitle className="text-base">Objectives</CardTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={category} onValueChange={(value) => setCategory(value as ObjectiveCategory | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => setStatus(value as ObjectiveStatus | "all")}>
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
      <CardContent className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-44 animate-pulse rounded-lg border border-border bg-surface2/50" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No objectives match the current filters.
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((objective) => (
              <ObjectiveCard
                key={objective.objective_id}
                objective={objective}
                pending={pendingId === objective.objective_id}
                onStatusChange={onStatusChange ? (nextStatus) => onStatusChange(objective.objective_id, nextStatus) : undefined}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
