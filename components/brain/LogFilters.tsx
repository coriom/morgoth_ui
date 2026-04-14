"use client";

import type { LogLevel } from "@/types/morgoth";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";

const LEVELS: LogLevel[] = ["THOUGHT", "ACTION", "RESULT", "ERROR", "SYSTEM"];

export interface LogFilterState {
  levels: LogLevel[];
  agent: string;
  range: string;
  search: string;
}

export function LogFilters({
  agents,
  filters,
  onChange,
}: {
  agents: string[];
  filters: LogFilterState;
  onChange: (filters: LogFilterState) => void;
}) {
  function toggleLevel(level: LogLevel) {
    const levels = filters.levels.includes(level)
      ? filters.levels.filter((item) => item !== level)
      : [...filters.levels, level];

    onChange({ ...filters, levels });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 lg:grid-cols-[1.5fr_220px_180px]">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Levels</p>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => toggleLevel(level)}
              className={cn(
                "rounded-full border border-border bg-surface2 px-3 py-1 font-mono text-xs text-textSecondary transition",
                filters.levels.includes(level) && "border-primary bg-primaryGlow text-textPrimary",
              )}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Agent</p>
        <Select value={filters.agent} onValueChange={(agent) => onChange({ ...filters, agent })}>
          <SelectTrigger>
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All agents</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent} value={agent}>
                {agent}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Time Range</p>
        <Select value={filters.range} onValueChange={(range) => onChange({ ...filters, range })}>
          <SelectTrigger>
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15m">Last 15m</SelectItem>
            <SelectItem value="1h">Last 1h</SelectItem>
            <SelectItem value="6h">Last 6h</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="lg:col-span-3">
        <Input
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Search log content..."
        />
      </div>
    </div>
  );
}
