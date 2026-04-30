"use client";

import { useMemo, useState } from "react";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvolutionPoint } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";

type Range = "7D" | "30D" | "ALL";

export function EvolutionTimeline({
  points,
  isLoading,
}: {
  points: EvolutionPoint[];
  isLoading: boolean;
}) {
  const [range, setRange] = useState<Range>("ALL");

  const filteredPoints = useMemo(() => {
    if (range === "ALL") {
      return points;
    }

    const days = range === "7D" ? 7 : 30;
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
    return points.filter((point) => new Date(point.timestamp).getTime() >= threshold);
  }, [points, range]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Evolution Timeline</CardTitle>
        <div className="flex gap-2">
          {(["7D", "30D", "ALL"] as Range[]).map((option) => (
            <Button key={option} size="sm" variant={option === range ? "default" : "secondary"} onClick={() => setRange(option)}>
              {option}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-80 animate-pulse rounded-xl border border-border bg-surface2/50" />
        ) : filteredPoints.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No evolution timeline points are available yet.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredPoints}>
                <defs>
                  <linearGradient id="mods" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(71,85,105,0.18)" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={(value) => formatTimestamp(value).split(",")[0]} stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" allowDecimals={false} />
                <Tooltip labelFormatter={(value) => formatTimestamp(String(value))} />
                <Area type="monotone" dataKey="self_mods" stroke="#7c3aed" fill="url(#mods)" strokeWidth={2} />
                <Area type="monotone" dataKey="tools" stroke="#06b6d4" fillOpacity={0} strokeWidth={2} />
                <Area type="monotone" dataKey="agents" stroke="#10b981" fillOpacity={0} strokeWidth={2} />
                <Area type="monotone" dataKey="knowledge" stroke="#f59e0b" fillOpacity={0} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
