"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LogEntry } from "@/types/morgoth";

interface ToolCount {
  tool: string;
  count: number;
}

const TOOL_PATTERNS = [
  /(?:calling|called|using|use|invoke)\s+(?:tool\s+)?[`"']?([a-zA-Z_][a-zA-Z0-9_]{2,})[`"']?/i,
  /tool[:\s]+[`"']?([a-zA-Z_][a-zA-Z0-9_]{2,})[`"']?/i,
  /\b([a-zA-Z_][a-zA-Z0-9_]{2,})\s*\(/,
];

const TOOL_BLACKLIST = new Set([
  "function","return","await","async","const","let","var","import","from","export",
  "class","interface","type","self","this","super","null","true","false","undefined",
]);

function extractToolName(content: string): string | null {
  for (const pattern of TOOL_PATTERNS) {
    const match = content.match(pattern);
    if (match?.[1] && !TOOL_BLACKLIST.has(match[1].toLowerCase())) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

function buildToolCounts(logs: LogEntry[]): ToolCount[] {
  const freq: Record<string, number> = {};
  for (const log of logs) {
    if (log.level !== "ACTION") continue;
    const tool = extractToolName(log.content);
    if (tool) {
      freq[tool] = (freq[tool] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

const BAR_COLORS = [
  "#22d3ee","#34d399","#a78bfa","#f59e0b","#f87171",
  "#38bdf8","#86efac","#c4b5fd","#fcd34d","#fca5a5",
];

export function ToolUsageChart({ logs, isLoading }: { logs: LogEntry[]; isLoading: boolean }) {
  const data = useMemo(() => buildToolCounts(logs), [logs]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400">
        Tool Usage Frequency
      </h2>

      {isLoading ? (
        <div className="h-52 animate-pulse rounded bg-zinc-800" />
      ) : data.length === 0 ? (
        <p className="font-mono text-xs text-zinc-600">
          No ACTION logs detected yet. Tool usage will appear here once Morgoth starts calling tools.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={data.length * 28 + 24}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "#52525b", fontSize: 10, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              dataKey="tool"
              type="category"
              width={90}
              tick={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
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
            <Bar dataKey="count" radius={[0, 2, 2, 0]} maxBarSize={20}>
              {data.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
