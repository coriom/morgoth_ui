"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Objective } from "@/types/morgoth";

interface DayBucket {
  date: string;
  count: number;
}

function bucketByDay(objectives: Objective[]): DayBucket[] {
  const map: Record<string, number> = {};
  for (const obj of objectives) {
    const day = obj.created_at.slice(0, 10);
    map[day] = (map[day] ?? 0) + 1;
  }

  const sorted = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30);

  return sorted.map(([date, count]) => ({
    date: date.slice(5),
    count,
  }));
}

export function ObjectivesHistogram({
  objectives,
  isLoading,
}: {
  objectives: Objective[];
  isLoading: boolean;
}) {
  const data = useMemo(() => bucketByDay(objectives), [objectives]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400">
        Objectives Created · Last 30 Days
      </h2>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded bg-zinc-800" />
      ) : data.length === 0 ? (
        <p className="font-mono text-xs text-zinc-600">No objectives to chart yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#52525b", fontSize: 10, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#52525b", fontSize: 10, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: "4px",
                fontSize: "11px",
                fontFamily: "monospace",
                color: "#d4d4d8",
              }}
              cursor={{ fill: "#27272a" }}
            />
            <Bar dataKey="count" fill="#22d3ee" radius={[2, 2, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
