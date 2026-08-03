"use client";

/**
 * SubjectGroupedTheses — grouped-by-subject knowledge view.
 *
 * Replaces the flat ThesesSection. Operator feedback: "why not, but
 * I dislike the presentation and want grouping by theme." Subject is
 * the theme; status/freshness are secondary filters that apply across
 * every section. Client-side grouping (data volume ~180 theses, no
 * backend aggregation needed).
 *
 * Section header carries thesis count + per-status breakdown + a ⚠
 * marker when contradicted theses exist for the subject (mirrors the
 * wiki's contradiction marker, so hubs where Morgoth disagrees with
 * itself surface at a glance).
 *
 * Sections sort by thesis count desc — the hubs first, matching the
 * vault's topology. Search narrows subjects client-side.
 */

import { AlertTriangle, ChevronDown, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import type { Thesis, ThesisConfidence, ThesisStatus } from "@/types/morgoth";

const ALL_STATUSES: ThesisStatus[] = ["active", "contradicted", "stale"];
const DEFAULT_STATUSES: ThesisStatus[] = ["active", "contradicted"];
type FreshnessSort = "newest" | "oldest";

interface SubjectGroup {
  subject: string;
  theses: Thesis[];
  statusCounts: Record<ThesisStatus, number>;
  hasContradiction: boolean;
  latestAt: number;
}

function groupBySubject(theses: Thesis[]): SubjectGroup[] {
  const buckets = new Map<string, Thesis[]>();
  for (const t of theses) {
    const key = (t.subject || "(no subject)").trim();
    const arr = buckets.get(key);
    if (arr) arr.push(t);
    else buckets.set(key, [t]);
  }
  const groups: SubjectGroup[] = [];
  for (const [subject, items] of buckets) {
    const statusCounts: Record<ThesisStatus, number> = {
      active: 0,
      contradicted: 0,
      stale: 0,
    };
    let latest = 0;
    for (const t of items) {
      statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
      const ts = new Date(t.created_at).getTime();
      if (!isNaN(ts) && ts > latest) latest = ts;
    }
    groups.push({
      subject,
      theses: items,
      statusCounts,
      hasContradiction: statusCounts.contradicted > 0,
      latestAt: latest,
    });
  }
  // Hubs first: thesis count desc, ties broken by most-recent activity.
  groups.sort((a, b) => {
    if (b.theses.length !== a.theses.length) return b.theses.length - a.theses.length;
    return b.latestAt - a.latestAt;
  });
  return groups;
}

function statusColorClass(status: ThesisStatus): string {
  switch (status) {
    case "active":
      return "bg-result/20 text-result border-result/40";
    case "contradicted":
      return "bg-error/20 text-error border-error/40";
    case "stale":
      return "bg-textMuted/20 text-textMuted border-textMuted/40";
  }
}

function confidenceLabel(c: ThesisConfidence): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function ThesisRow({ thesis }: { thesis: Thesis }) {
  const dimmed = thesis.status !== "active";
  return (
    <div
      className={cn(
        "rounded border border-border bg-surface2/40 p-3 text-sm",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 text-textPrimary">{thesis.claim}</p>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase",
            statusColorClass(thesis.status),
          )}
        >
          {thesis.status}
        </span>
      </div>
      {thesis.evidence.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {thesis.evidence.map((ev, i) => (
            <span
              key={i}
              title={ev.detail}
              className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[10px] text-textSecondary"
            >
              {ev.source}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-textMuted">
        <span className="font-mono">confidence: {confidenceLabel(thesis.confidence)}</span>
        <span className="font-mono" title={new Date(thesis.created_at).toISOString()}>
          {formatRelativeTime(thesis.created_at)}
        </span>
      </div>
    </div>
  );
}

function SubjectSection({
  group,
  freshness,
  visibleStatuses,
}: {
  group: SubjectGroup;
  freshness: FreshnessSort;
  visibleStatuses: Set<ThesisStatus>;
}) {
  const [open, setOpen] = useState(true);
  const visible = useMemo(() => {
    const filtered = group.theses.filter((t) => visibleStatuses.has(t.status));
    return filtered.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return freshness === "newest" ? tb - ta : ta - tb;
    });
  }, [group.theses, freshness, visibleStatuses]);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-surface2/50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-textMuted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-textMuted" />
        )}
        <span className="font-mono text-sm text-textPrimary">{group.subject}</span>
        {group.hasContradiction ? (
          <AlertTriangle className="h-3.5 w-3.5 text-error" aria-label="contradiction" />
        ) : null}
        <span className="ml-auto flex items-center gap-2 text-xs text-textSecondary">
          <span className="font-mono">{group.theses.length}</span>
          {(["active", "contradicted", "stale"] as ThesisStatus[])
            .filter((s) => group.statusCounts[s] > 0)
            .map((s) => (
              <span
                key={s}
                className={cn(
                  "rounded border px-1 font-mono text-[10px]",
                  statusColorClass(s),
                )}
              >
                {group.statusCounts[s]} {s}
              </span>
            ))}
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border p-3">
          {visible.length === 0 ? (
            <p className="text-xs text-textMuted">
              No theses match the current status filter.
            </p>
          ) : (
            visible.map((t) => <ThesisRow key={t.thesis_id} thesis={t} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

function SkeletonSections() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-lg border border-border bg-surface2/40"
        />
      ))}
    </div>
  );
}

export function SubjectGroupedTheses() {
  const thesesQuery = useQuery({
    queryKey: ["knowledge", "theses", "all"],
    // Ask for the full set — grouping + filtering happens client-side
    // (data volume is small; the alternative would be a per-status
    // endpoint round-trip on every filter change).
    queryFn: () => api.knowledge.theses(),
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const [search, setSearch] = useState("");
  const [freshness, setFreshness] = useState<FreshnessSort>("newest");
  const [statuses, setStatuses] = useState<Set<ThesisStatus>>(
    () => new Set(DEFAULT_STATUSES),
  );

  const groups = useMemo(
    () => groupBySubject(thesesQuery.data ?? []),
    [thesesQuery.data],
  );
  const filteredGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((g) => g.subject.toLowerCase().includes(needle));
  }, [groups, search]);

  const toggleStatus = (s: ThesisStatus) =>
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">Theses by subject</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-textMuted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter subjects…"
              className="w-full rounded border border-border bg-surface2 py-1.5 pl-7 pr-2 text-sm text-textPrimary placeholder:text-textMuted"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-textMuted">status:</span>
            {ALL_STATUSES.map((s) => {
              const on = statuses.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    "rounded border px-2 py-0.5 font-mono text-[10px] uppercase transition",
                    on
                      ? statusColorClass(s)
                      : "border-border bg-transparent text-textMuted hover:text-textSecondary",
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-textMuted">sort:</span>
            {(["newest", "oldest"] as FreshnessSort[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFreshness(f)}
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-[10px] uppercase transition",
                  freshness === f
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-transparent text-textMuted hover:text-textSecondary",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {thesesQuery.isLoading ? (
          <SkeletonSections />
        ) : thesesQuery.isError ? (
          <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
            Failed to load theses
            {thesesQuery.error instanceof ApiError
              ? `: ${thesesQuery.error.message}`
              : "."}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No theses yet — Morgoth accumulates beliefs as objectives complete.
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No subjects match “{search}”.
          </div>
        ) : (
          filteredGroups.map((group) => (
            <SubjectSection
              key={group.subject}
              group={group}
              freshness={freshness}
              visibleStatuses={statuses}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
