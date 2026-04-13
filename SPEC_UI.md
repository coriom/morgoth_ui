# SPEC.md — Morgoth UI
> Version 1.0 — Bootstrap Specification  
> Next.js frontend for the Morgoth Autonomous Intelligence System  
> This document is the single source of truth for Codex during UI development.

---

## 0. Philosophy & Principles

- **Dark mode only** — no light mode, no toggle. Morgoth is a terminal intelligence.
- **Real-time first** — the UI is a live window into Morgoth's mind. Data is pushed, not polled.
- **Density over simplicity** — this is a power tool, not a consumer app. Pack information intelligently.
- **Terminal aesthetic** — monospace fonts for logs and data, subtle glow effects, minimal chrome.
- **Component-first** — every widget is an isolated component. Pages are compositions of widgets.
- **API contract respect** — the UI never assumes data shape. It follows the WebSocket and REST contracts defined in `morgoth/SPEC.md` section 4 and 6 exactly.

---

## 1. Tech Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14+ |
| Language | TypeScript | 5+ |
| Styling | Tailwind CSS | 3+ |
| Components | shadcn/ui | latest |
| Charts | Recharts | 2+ |
| Icons | Lucide React | latest |
| WebSocket | Native browser WebSocket | — |
| HTTP Client | fetch (native) + custom wrapper | — |
| State (global) | Zustand | 4+ |
| State (server) | TanStack Query (React Query) | 5+ |
| Fonts | JetBrains Mono (logs/data) + Inter (UI) | — |
| Animation | Framer Motion | 11+ |

---

## 2. Repository Structure

```
morgoth_ui/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout (theme, fonts, providers)
│   ├── page.tsx                      # / → Dashboard
│   ├── chat/
│   │   └── page.tsx                  # /chat → Full chat interface
│   ├── agents/
│   │   └── page.tsx                  # /agents → Agent monitor
│   ├── market/
│   │   └── page.tsx                  # /market → Market deep view
│   ├── brain/
│   │   └── page.tsx                  # /brain → Logs + tasks + self-modify history
│   └── admin/
│       └── page.tsx                  # /admin → Permissions editor
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx               # Left navigation
│   │   ├── TopBar.tsx                # Status bar (connection, model, uptime)
│   │   └── PageWrapper.tsx           # Consistent page container
│   │
│   ├── chat/
│   │   ├── ChatWindow.tsx            # Full chat interface
│   │   ├── MessageBubble.tsx         # Single message rendering
│   │   ├── ChatInput.tsx             # Input bar with send button
│   │   └── ThoughtStream.tsx         # Live THOUGHT log overlay
│   │
│   ├── dashboard/
│   │   ├── BrainStatusCard.tsx       # Model active, tokens/s, queue depth
│   │   ├── MarketOverviewCard.tsx    # Top 5 crypto prices
│   │   ├── ActiveAgentsCard.tsx      # Running agents summary
│   │   ├── RecentLogsCard.tsx        # Last 10 log entries
│   │   └── AlertsFeed.tsx            # CRITICAL + WARNING events
│   │
│   ├── market/
│   │   ├── PriceTable.tsx            # Sortable crypto price table
│   │   ├── PriceChart.tsx            # Recharts line chart for price history
│   │   ├── MarketStats.tsx           # Volume, market cap, dominance
│   │   └── SymbolSearch.tsx          # Search + add symbols to watch
│   │
│   ├── agents/
│   │   ├── AgentCard.tsx             # Single agent status card
│   │   ├── AgentList.tsx             # Grid of AgentCards
│   │   ├── CreateAgentModal.tsx      # Modal to create new agent
│   │   └── AgentLogDrawer.tsx        # Slide-out drawer with agent logs
│   │
│   ├── brain/
│   │   ├── LogFeed.tsx               # Real-time scrolling log viewer
│   │   ├── LogEntry.tsx              # Single log line with level coloring
│   │   ├── LogFilters.tsx            # Filter by level, agent, time range
│   │   ├── TaskQueue.tsx             # Task queue visualization
│   │   ├── TaskCard.tsx              # Single task card
│   │   └── SelfModifyHistory.tsx     # Table of self-modifications
│   │
│   ├── admin/
│   │   ├── PermissionsEditor.tsx     # Toggle switches for MORGOTH_PERMS
│   │   └── ModelSelector.tsx        # Ollama model switcher
│   │
│   └── ui/                           # shadcn/ui base components
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── drawer.tsx
│       ├── input.tsx
│       ├── select.tsx
│       ├── switch.tsx
│       ├── table.tsx
│       ├── tabs.tsx
│       └── tooltip.tsx
│
├── lib/
│   ├── ws-client.ts                  # WebSocket singleton + reconnect logic
│   ├── api.ts                        # Typed REST API wrapper
│   ├── store/
│   │   ├── brain.store.ts            # Brain status, logs, tasks
│   │   ├── market.store.ts           # Prices, history
│   │   ├── agents.store.ts           # Agents list + status
│   │   └── chat.store.ts             # Conversation history
│   └── utils/
│       ├── format.ts                 # Number formatting, timestamps
│       └── colors.ts                 # Level → color mapping
│
├── hooks/
│   ├── useWebSocket.ts               # WS connection hook
│   ├── useBrainStatus.ts             # Polling brain status
│   ├── useMarketData.ts              # Market data with auto-refresh
│   └── useAgents.ts                  # Agents CRUD
│
├── types/
│   └── morgoth.ts                    # All TypeScript types mirroring SPEC contracts
│
├── public/
│   └── fonts/                        # JetBrains Mono local files
│
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
├── .env.local
└── package.json
```

---

## 3. Design System

### 3.1 Color Palette

```typescript
// tailwind.config.ts — extend colors
colors: {
  background:   "#0a0a0f",    // near black, main bg
  surface:      "#111118",    // cards, panels
  surface2:     "#1a1a24",    // elevated surfaces, inputs
  border:       "#2a2a3a",    // subtle borders
  
  // Morgoth brand
  primary:      "#7c3aed",    // violet — Morgoth's identity color
  primaryGlow:  "#7c3aed33",  // violet with opacity for glow effects
  
  // Log levels
  thought:      "#6b7280",    // gray — internal reasoning
  action:       "#3b82f6",    // blue — doing something
  result:       "#10b981",    // green — outcome
  error:        "#ef4444",    // red — error
  system:       "#f59e0b",    // amber — system events

  // Market
  bullish:      "#10b981",    // green
  bearish:      "#ef4444",    // red
  neutral:      "#6b7280",    // gray

  // Text
  textPrimary:  "#f1f5f9",
  textSecondary:"#94a3b8",
  textMuted:    "#475569",
}
```

### 3.2 Typography

```typescript
// Two font families only
fonts: {
  sans: ["Inter", "sans-serif"],           // UI text, labels, descriptions
  mono: ["JetBrains Mono", "monospace"],   // Logs, prices, code, IDs
}
```

Rules:
- All log entries, prices, agent IDs, timestamps → `font-mono`
- All navigation, labels, descriptions, buttons → `font-sans`
- Never mix fonts within the same component

### 3.3 Component Visual Language

**Cards**
```
background: surface (#111118)
border: 1px solid border (#2a2a3a)
border-radius: 12px
padding: 20px
```

**Glows** (use sparingly — active states only)
```
box-shadow: 0 0 20px primaryGlow
```

**Log level colors** (left border only, 3px)
```
THOUGHT → border-left: 3px solid thought
ACTION  → border-left: 3px solid action
RESULT  → border-left: 3px solid result
ERROR   → border-left: 3px solid error
SYSTEM  → border-left: 3px solid system
```

**Status badges**
```
RUNNING  → bg-action/20 text-action
IDLE     → bg-surface2 text-textSecondary
FAILED   → bg-error/20 text-error
PAUSED   → bg-system/20 text-system
```

### 3.4 Layout

```
┌─────────────────────────────────────────────────┐
│  TopBar — connection status, model, uptime       │ h-12
├──────────┬──────────────────────────────────────┤
│          │                                       │
│ Sidebar  │  Page Content                         │
│  w-56    │  flex-1, overflow-y-auto              │
│          │                                       │
│          │                                       │
└──────────┴──────────────────────────────────────┘
```

Sidebar is collapsible to icon-only mode (w-14).  
No top navigation — sidebar only.

---

## 4. Pages Specification

### 4.1 Dashboard — `/`

**Purpose**: At-a-glance overview of Morgoth's current state.

**Layout**: Responsive CSS grid

```
┌─────────────────┬─────────────────┬─────────────┐
│  BrainStatus    │  MarketOverview  │  Alerts     │
│  Card           │  Card            │  Feed       │
├─────────────────┴─────────────────┤             │
│  ActiveAgents Card                 │             │
├────────────────────────────────────┤             │
│  RecentLogs Card (last 10 entries) │             │
└────────────────────────────────────┴─────────────┘
```

**Data sources**:
- `GET /api/brain/status` → BrainStatusCard (polled every 5s)
- `GET /api/market/prices` → MarketOverviewCard (live via WS)
- `GET /api/agents` → ActiveAgentsCard (live via WS)
- WS stream → RecentLogsCard, AlertsFeed

**BrainStatusCard must show**:
- Active model name
- Tokens/second (last inference)
- Task queue depth
- VRAM usage (if available from Ollama)
- System uptime
- Morgoth operational status (AWAKENING / BRIEFING / EXPLORATION / OPERATIONAL)

---

### 4.2 Chat — `/chat`

**Purpose**: Full-screen conversational interface with Morgoth.

**Layout**:
```
┌──────────────────────────────┬────────────────┐
│                              │  ThoughtStream  │
│  ChatWindow                  │  (collapsible   │
│  (messages)                  │   right panel)  │
│                              │                 │
│                              │  Shows live     │
│                              │  THOUGHT logs   │
│                              │  as Morgoth     │
│                              │  processes      │
├──────────────────────────────┴────────────────┤
│  ChatInput (full width)                        │
└────────────────────────────────────────────────┘
```

**Message rendering rules**:
- User messages → right-aligned, `surface2` background
- Morgoth messages → left-aligned, subtle violet left border
- Code blocks in Morgoth responses → syntax-highlighted, monospace, dark bg
- Markdown support: bold, italic, code, tables, lists
- Timestamps on hover only (not persistent — reduces noise)
- Auto-scroll to bottom on new message, pausable if user scrolls up

**ThoughtStream panel**:
- Shows only `THOUGHT` level WS events in real time
- Greyed out, smaller font — it's ambient, not primary
- Toggle button to show/hide
- Fades old thoughts out after 30 seconds

**ChatInput**:
- Textarea (auto-resize, max 6 lines)
- Send on Enter, newline on Shift+Enter
- Send button with loading spinner while Morgoth responds
- Disabled while waiting for response

---

### 4.3 Agents — `/agents`

**Purpose**: Monitor, create, and manage Morgoth's agents.

**Layout**:
```
┌─────────────────────────────────────────────┐
│  Header: "Agents" + [+ Create Agent] button  │
├──────────────┬──────────────┬───────────────┤
│  AgentCard   │  AgentCard   │  AgentCard    │
│  (running)   │  (idle)      │  (failed)     │
├──────────────┴──────────────┴───────────────┤
│  Completed / Stopped agents (collapsed list) │
└──────────────────────────────────────────────┘
```

**AgentCard must show**:
- Agent name + type badge (EPHEMERAL / PERSISTENT)
- Status badge with color
- Current task description (truncated)
- Model being used
- Created at timestamp
- Tools available (icon list)
- [View Logs] button → opens AgentLogDrawer
- [Stop] button (only for PERSISTENT agents)

**CreateAgentModal fields**:
- Agent name (text input)
- Type (EPHEMERAL / PERSISTENT toggle)
- Model (dropdown: deepseek-r1:14b / llama3.1:8b)
- Task description (textarea)
- Tools to enable (multi-select checkboxes)

**AgentLogDrawer**:
- Slides in from right
- Shows real-time log stream filtered to this agent_id
- Filter by log level
- Download logs as JSON button

---

### 4.4 Market — `/market`

**Purpose**: Crypto and finance monitoring dashboard.

**Layout**:
```
┌─────────────────────────────────────────────┐
│  MarketStats bar (total market cap, BTC dom) │
├───────────────────────────┬─────────────────┤
│  PriceTable               │  PriceChart     │
│  (sortable, all symbols)  │  (selected sym) │
│                           │                 │
├───────────────────────────┴─────────────────┤
│  SymbolSearch — add symbols to watchlist     │
└──────────────────────────────────────────────┘
```

**PriceTable columns**:
- Rank
- Symbol + name
- Price (monospace, color by 24h change)
- 24h Change % (red/green badge)
- 24h Volume
- Market Cap
- Sparkline (7-day mini chart, Recharts)

Clicking a row updates the PriceChart on the right.

**PriceChart**:
- Line chart (Recharts LineChart)
- Time range selector: 1D / 7D / 30D / 90D
- Shows price + volume (dual axis)
- Tooltip with exact price + timestamp on hover
- Smooth curve, no dots, area fill with gradient

**MarketStats bar**:
- Total crypto market cap
- BTC dominance %
- ETH dominance %
- Fear & Greed index (if available via free API)
- Last updated timestamp

---

### 4.5 Brain — `/brain`

**Purpose**: Deep visibility into Morgoth's internal operations.

**Layout**: Three tabs

```
[ Logs ] [ Task Queue ] [ Self-Modifications ]
```

**Logs tab**:
- `LogFilters` bar at top: level multiselect, agent dropdown, time range picker, search text
- `LogFeed` below: virtualized scrolling list (react-virtual or similar)
- Each `LogEntry` shows: timestamp (mono), level badge, agent name, content
- Auto-scroll toggle
- Export as JSON/CSV button
- Live indicator (green dot pulsing when connected to WS)

**Task Queue tab**:
- Priority lanes: CRITICAL / HIGH / NORMAL / BACKGROUND
- Each `TaskCard` shows: task ID (truncated), description, type badge, created by, created at, assigned agent
- Running tasks show elapsed time counter
- Empty state: "No tasks in queue — Morgoth is idle"

**Self-Modifications tab**:
- Table: timestamp, file modified, reason, test result (PASS/FAIL badge), approved by
- Click a row → expands to show full diff (syntax highlighted, green/red lines)
- Filter: date range, file path, result

---

### 4.6 Admin — `/admin`

**Purpose**: Control Morgoth's permissions and configuration.

**Layout**: Two sections

```
┌───────────────────────────────┐
│  Permissions                  │
│  (toggle switches grid)       │
├───────────────────────────────┤
│  Model Configuration          │
│  (dropdowns + test button)    │
└───────────────────────────────┘
```

**Permissions section**:
- Reads from `GET /api/admin/permissions`
- Each permission in `MORGOTH_PERMS.json` → labeled toggle switch
- Grouped: Agents / Code / Files / Notifications / Finance
- Save button → `PATCH /api/admin/permissions`
- Warning modal before enabling `can_self_modify` or `can_place_real_orders`
- Last updated by + timestamp shown

**Model Configuration**:
- Primary model dropdown (lists available Ollama models)
- Agent model dropdown
- [Test Connection] button → calls `GET /api/brain/status` and shows latency
- Max concurrent agents slider (1–5, constrained by hardware)

---

## 5. WebSocket Client

```typescript
// lib/ws-client.ts

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/chat"

class MorgothWSClient {
  private socket: WebSocket | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private listeners: Map<string, Set<(data: WSMessage) => void>> = new Map()

  connect(): void
  disconnect(): void
  send(message: WSOutboundMessage): void
  on(type: string, callback: (data: WSMessage) => void): () => void  // returns unsubscribe fn
  private reconnect(): void   // exponential backoff
}

export const wsClient = new MorgothWSClient()

// Message types (mirrors morgoth SPEC section 4.4)
interface WSMessage {
  type: "thought" | "action" | "result" | "error" | "agent_update" | "market_update" | "system"
  timestamp: string
  agent_id: string | null
  content: string
  metadata: Record<string, unknown>
}

interface WSOutboundMessage {
  type: "chat" | "command"
  content: string
  user_id: string
}
```

**Reconnection logic**:
- Exponential backoff starting at 1s, max 30s
- TopBar shows connection state: `CONNECTED` (green) / `RECONNECTING` (amber, with attempt count) / `DISCONNECTED` (red)
- All stores continue to hold last-known state during disconnection

---

## 6. REST API Wrapper

```typescript
// lib/api.ts

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// All functions are typed, throw on non-2xx
export const api = {
  chat: {
    send: (content: string) => POST("/api/chat", { content }),
    history: (limit?: number) => GET("/api/chat/history", { limit }),
  },
  agents: {
    list: () => GET("/api/agents"),
    create: (data: CreateAgentPayload) => POST("/api/agents", data),
    get: (id: string) => GET(`/api/agents/${id}`),
    delete: (id: string) => DELETE(`/api/agents/${id}`),
  },
  market: {
    prices: () => GET("/api/market/prices"),
    history: (symbol: string, range: string) => GET(`/api/market/history/${symbol}`, { range }),
  },
  brain: {
    status: () => GET("/api/brain/status"),
    logs: (params: LogQueryParams) => GET("/api/brain/logs", params),
    tasks: () => GET("/api/brain/tasks"),
  },
  admin: {
    permissions: () => GET("/api/admin/permissions"),
    updatePermissions: (data: Partial<Permissions>) => PATCH("/api/admin/permissions", data),
  },
}
```

---

## 7. Zustand Stores

### brain.store.ts
```typescript
interface BrainStore {
  status: BrainStatus | null
  logs: LogEntry[]
  tasks: Task[]
  connected: boolean
  setStatus: (s: BrainStatus) => void
  addLog: (entry: LogEntry) => void       // max 500 entries in memory
  setTasks: (tasks: Task[]) => void
  setConnected: (v: boolean) => void
}
```

### market.store.ts
```typescript
interface MarketStore {
  prices: Record<string, PriceData>
  selectedSymbol: string
  history: Record<string, PricePoint[]>
  setPrice: (symbol: string, data: PriceData) => void
  setHistory: (symbol: string, data: PricePoint[]) => void
  setSelectedSymbol: (s: string) => void
}
```

### agents.store.ts
```typescript
interface AgentsStore {
  agents: Agent[]
  setAgents: (agents: Agent[]) => void
  updateAgent: (id: string, update: Partial<Agent>) => void
  removeAgent: (id: string) => void
}
```

### chat.store.ts
```typescript
interface ChatStore {
  messages: ChatMessage[]
  isThinking: boolean
  addMessage: (msg: ChatMessage) => void
  setThinking: (v: boolean) => void
  clearHistory: () => void
}
```

---

## 8. TypeScript Types

```typescript
// types/morgoth.ts — mirrors morgoth/SPEC.md section 4

export type LogLevel = "THOUGHT" | "ACTION" | "RESULT" | "ERROR" | "SYSTEM"
export type AgentType = "ephemeral" | "persistent"
export type AgentStatus = "idle" | "running" | "paused" | "completed" | "failed"
export type TaskPriority = 0 | 1 | 2 | 3   // CRITICAL=0 ... BACKGROUND=3
export type TaskType = "one_shot" | "recurring" | "triggered"
export type TaskStatus = "pending" | "running" | "completed" | "failed"

export interface LogEntry {
  log_id: string
  timestamp: string
  level: LogLevel
  agent: string
  content: string
  tokens_used: number | null
  duration_ms: number | null
  user_id: string
}

export interface Agent {
  agent_id: string
  name: string
  agent_type: AgentType
  status: AgentStatus
  model: string
  tools: string[]
  created_at: string
  stopped_at: string | null
  user_id: string
}

export interface Task {
  task_id: string
  type: TaskType
  priority: TaskPriority
  description: string
  agent_id: string | null
  created_by: string
  created_at: string
  scheduled_at: string | null
  recurrence_cron: string | null
  status: TaskStatus
  result: Record<string, unknown> | null
  user_id: string
}

export interface PriceData {
  symbol: string
  name: string
  price: number
  change_24h: number
  volume_24h: number
  market_cap: number
  last_updated: string
}

export interface PricePoint {
  timestamp: string
  price: number
  volume: number
}

export interface BrainStatus {
  operational_status: "AWAKENING" | "BRIEFING" | "EXPLORATION" | "OPERATIONAL"
  active_model: string
  tokens_per_second: number | null
  task_queue_depth: number
  active_agents: number
  uptime_seconds: number
  ollama_connected: boolean
  postgres_connected: boolean
}

export interface SelfModification {
  mod_id: string
  timestamp: string
  file_path: string
  diff: string
  reason: string
  test_result: { passed: boolean; output: string }
  approved_by: string
}

export interface Permissions {
  can_create_ephemeral_agents: boolean
  can_create_persistent_agents: boolean
  can_self_modify: boolean
  can_store_secrets: boolean
  can_pull_ollama_models: boolean
  can_execute_code: boolean
  can_write_files: boolean
  can_send_notifications: boolean
  can_access_internet: boolean
  can_place_real_orders: boolean
}

export interface ChatMessage {
  id: string
  role: "user" | "morgoth"
  content: string
  timestamp: string
}
```

---

## 9. Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/chat
```

---

## 10. Sidebar Navigation

```typescript
const NAV_ITEMS = [
  { href: "/",       icon: LayoutDashboard, label: "Dashboard" },
  { href: "/chat",   icon: MessageSquare,   label: "Chat"      },
  { href: "/agents", icon: Bot,             label: "Agents"    },
  { href: "/market", icon: TrendingUp,      label: "Market"    },
  { href: "/brain",  icon: Brain,           label: "Brain"     },
  { href: "/admin",  icon: Settings,        label: "Admin"     },
]
```

Active state: `primary` color left border + icon glow.  
Collapsed state: icon only, tooltip on hover showing label.

---

## 11. TopBar

Always visible. Shows from left to right:

```
[Morgoth Logo/Name]  [Spacer]  [Model: deepseek-r1:14b]  [Tasks: 3]  [Agents: 2/3]  [● CONNECTED]  [Uptime: 4h 23m]
```

- All values update via Zustand store (pushed from WS)
- Connection indicator pulses green when receiving WS events
- Clicking model name → navigates to `/admin`

---

## 12. Codex Development Instructions

> This section is specifically for Codex reading this spec.

### Phase 1 Deliverables (build in order)

1. `tailwind.config.ts` — full design system colors, fonts
2. `types/morgoth.ts` — all TypeScript types
3. `lib/ws-client.ts` — WebSocket singleton
4. `lib/api.ts` — REST wrapper
5. `lib/store/brain.store.ts`
6. `lib/store/market.store.ts`
7. `lib/store/agents.store.ts`
8. `lib/store/chat.store.ts`
9. `lib/utils/format.ts` — formatPrice, formatChange, formatUptime, formatTimestamp
10. `lib/utils/colors.ts` — levelToColor, changeToColor
11. `hooks/useWebSocket.ts` — connects WS, populates all stores from incoming events
12. `hooks/useMarketData.ts`
13. `hooks/useBrainStatus.ts`
14. `hooks/useAgents.ts`
15. `app/layout.tsx` — providers (Zustand, ReactQuery), fonts, dark bg
16. `components/layout/TopBar.tsx`
17. `components/layout/Sidebar.tsx`
18. `components/layout/PageWrapper.tsx`
19. All `components/ui/*` (shadcn/ui setup)
20. `components/dashboard/*` — all 5 dashboard cards
21. `app/page.tsx` — Dashboard
22. `components/chat/*` — all 4 chat components
23. `app/chat/page.tsx`
24. `components/agents/*` — all 4 agent components
25. `app/agents/page.tsx`
26. `components/market/*` — all 4 market components
27. `app/market/page.tsx`
28. `components/brain/*` — all 6 brain components
29. `app/brain/page.tsx`
30. `components/admin/*` — both admin components
31. `app/admin/page.tsx`

### Code Style Rules

- All components use **named exports** (not default)
- All async data fetching via **TanStack Query** hooks — no raw fetch in components
- All global state via **Zustand** — no prop drilling beyond 1 level
- **Never hardcode colors** — always use Tailwind classes mapped to the design system
- Every component file has a single responsibility
- Loading states: always show skeleton (not spinner) for data-heavy components
- Error states: always show a non-blocking inline error (not a full-page error)
- Empty states: always show a meaningful empty state message

### Skeleton Loading Pattern

Use for: PriceTable, LogFeed, AgentList, TaskQueue

```tsx
// Example skeleton for AgentCard
<div className="animate-pulse">
  <div className="h-4 bg-surface2 rounded w-3/4 mb-2" />
  <div className="h-3 bg-surface2 rounded w-1/2" />
</div>
```

### package.json baseline

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "typescript": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "zustand": "^4.5.0",
    "@tanstack/react-query": "^5.40.0",
    "recharts": "^2.12.0",
    "lucide-react": "^0.383.0",
    "framer-motion": "^11.2.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@radix-ui/react-select": "^2.0.0",
    "react-virtual": "^2.10.4"
  }
}
```

---

## 13. WebSocket Event Routing

When a WS message arrives, it must be routed to the right store:

```typescript
wsClient.on("*", (msg: WSMessage) => {
  // Always add to brain logs
  if (["thought", "action", "result", "error", "system"].includes(msg.type)) {
    brainStore.addLog(toLogEntry(msg))
  }

  // Route to specific stores
  switch (msg.type) {
    case "agent_update":
      agentsStore.updateAgent(msg.agent_id!, msg.metadata as Partial<Agent>)
      break
    case "market_update":
      marketStore.setPrice(msg.metadata.symbol as string, msg.metadata as PriceData)
      break
    case "result":
      if (msg.agent_id === "morgoth_core") {
        chatStore.addMessage({ role: "morgoth", content: msg.content, ... })
        chatStore.setThinking(false)
      }
      break
  }
})
```

---

*End of SPEC.md v1.0 — morgoth_ui*  
*To be read alongside morgoth/SPEC.md. Both specs must stay in sync when interfaces change.*