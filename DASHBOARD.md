# Dashboard Architecture

This document describes the architecture of Morgoth's real-time observation dashboard.

---

## Overview

The dashboard is a dense, terminal-inspired interface for observing Morgoth's autonomous operation.
Design language: Bloomberg terminal × tactical ops console. Background `zinc-950`, accent palette
`cyan-400` (info) / `emerald-500` (success) / `amber-500` (warning) / `red-500` (error).

---

## Pages

### `/` — Live Dashboard (Priority 1)

```
┌─ StatusBar (sticky) ──────────────────────────────────────────────┐
│  ● MORGOTH ONLINE  │  UP 4h 23m  │  CYCLE #1,247  │  VRAM ████░  │
│  12 OBJ  ·  3 DONE  ·  9 ACTIVE  │  AUTO 25%                     │
└───────────────────────────────────────────────────────────────────┘
┌─ CycleFeed (40%) ─┐  ┌─ ObjectivesPanel (60%) ──────────────────┐
│  Live log stream  │  │  Grouped by status: IN PROGRESS / PENDING │
│  per tool call    │  │  Each card: title, progress bar, evidence  │
│  color-coded      │  │  Badge: AUTO (orange) or HUMAN (green)     │
│  auto-scroll top  │  │  Relative timestamps                       │
└───────────────────┘  └───────────────────────────────────────────┘
```

**Polling intervals:**
- `StatusBar`: `/api/brain/status` every 10s, `/api/objectives/stats` every 30s
- `CycleFeed`: `/api/brain/logs` every 5s (limit=80, stale=5s)
- `ObjectivesPanel`: `/api/objectives` every 30s

### `/mind` — Mind Analytics (Priority 2)

Top row: `TopicsCloud` | `ObjectivesHistogram`
Full width: `ToolUsageChart`
Below: Existing `ObjectivesList`

**Data sources:**
- Topics cloud: THOUGHT-level logs, word frequency extraction, top 60 words
- Histogram: objectives `created_at` bucketed by day, last 30 days (recharts BarChart)
- Tool chart: ACTION-level logs, tool name regex extraction, top 15 tools (recharts horizontal BarChart)

### `/evolution` — Self-Modification Timeline (Priority 3)

Shows the 4 growth metrics (self-mods / tools / agents / knowledge), then the `SelfModifyLog`
with expandable diffs per modification. Renders a "No Evolutions Yet" state if the backend
returns an empty array.

---

## Component Tree

```
components/
├── dashboard/                ← New components added in this upgrade
│   ├── StatusBar.tsx          Status vitals strip (sticky)
│   ├── CycleFeed.tsx          Live log feed with icons
│   ├── ObjectiveCard.tsx      Enhanced card with evidence accordion
│   ├── ObjectivesPanel.tsx    Grouped objectives with status sections
│   ├── TopicsCloud.tsx        Frequency-weighted word cloud from logs
│   ├── ObjectivesHistogram.tsx  Objectives per day bar chart
│   └── ToolUsageChart.tsx     Tool call frequency horizontal bar chart
├── evolution/                ← Existing, used as-is
│   ├── SelfModifyLog.tsx
│   ├── SelfModifyEntry.tsx
│   └── GrowthMetrics.tsx
└── mind/
    └── ObjectivesList.tsx    ← Kept from previous design
```

---

## Type Extensions (types/morgoth.ts)

```typescript
// Extended BrainStatus — new optional fields (backend TODO)
interface BrainStatus {
  ...existing fields...
  uptime_seconds?: number;
  cycle_count?: number;
  last_cycle_at?: string | null;
  vram_used_mb?: number | null;
  vram_total_mb?: number | null;
}

// New
interface ObjectiveStats {
  total: number;
  by_status: Record<string, number>;
  auto_completed?: number;
}

// Extended
interface LogQueryParams {
  ...existing...
  limit?: number;    // added — backend already supports this param
}
```

---

## State Management

- **TanStack Query** handles all server state (polling, caching, loading/error states)
- **Zustand** stores (`brain.store`, `mind.store`) hold synchronized snapshots for cross-page access
- Dashboard pages do NOT use Zustand directly — they read from TanStack Query cache

---

## Design Tokens Used

| Token | Value | Use |
|---|---|---|
| `bg-zinc-950` | `#09090b` | Page backgrounds |
| `bg-zinc-900` | `#18181b` | Card backgrounds |
| `border-zinc-800` | `#27272a` | Card borders |
| `text-cyan-400` | `#22d3ee` | Info, ACTION logs, cycle numbers |
| `text-emerald-400/500` | `#34d399` | Success, RESULT logs, done objectives |
| `text-amber-400/500` | `#fbbf24` | Warning, SYSTEM logs, pending |
| `text-red-400/500` | `#f87171` | Error, ERROR logs, failed |
| `text-violet-400` | `#a78bfa` | Self-modifications |
| `font-mono` | JetBrains Mono | All data values, log entries, badges |

---

## Missing Backend Capabilities

See `TODO.md` for the full list. Key gaps:
1. `BrainStatus` missing `uptime_seconds`, `cycle_count`, `last_cycle_at`, `vram_*`
2. `Objective` missing `cycle_count` / `max_cycles` for accurate progress bars
3. `/api/objectives/stats` response shape needs documenting
4. Evolution metrics/timeline endpoints may not exist

All missing fields are optional — the UI gracefully degrades with "N/A" labels.

---

*Dashboard upgrade completed — 2026-05-14*
