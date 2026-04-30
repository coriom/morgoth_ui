# SPEC_UI.md — Morgoth UI
> Version 2.0 — Consciousness Viewer  
> Next.js frontend for the Morgoth Autonomous Intelligence System  
> This is a REFACTOR of v1.0 — the UI is no longer a crypto dashboard.  
> It is a window into Morgoth's consciousness.

---

## 0. Philosophy

- **Dark mode only** — Morgoth is a terminal intelligence
- **Real-time first** — the UI is a live window into Morgoth's mind, data is pushed not polled
- **Consciousness over data** — show what Morgoth thinks, not what markets do
- **Scalable by design** — no hardcoded lists, everything driven by Morgoth's state
- **Terminal aesthetic** — monospace for logs and data, violet glow for Morgoth identity

---

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript strict |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Graphs | D3.js (nebula, mind map) + Recharts (time series) |
| Icons | Lucide React |
| WebSocket | Native browser WebSocket |
| State (global) | Zustand |
| State (server) | TanStack Query |
| Fonts | JetBrains Mono (data/logs) + Inter (UI) |
| Animation | Framer Motion |

---

## 2. Repository Structure

```
morgoth_ui/
├── app/
│   ├── layout.tsx                    # Root layout — providers, fonts, dark bg
│   ├── page.tsx                      # / → Consciousness (thought nebula)
│   ├── mind/
│   │   └── page.tsx                  # /mind → Mind Map (knowledge + objectives)
│   ├── evolution/
│   │   └── page.tsx                  # /evolution → Evolution Log
│   ├── warroom/
│   │   └── page.tsx                  # /warroom → War Room (agents)
│   ├── chat/
│   │   └── page.tsx                  # /chat → Direct Link
│   └── admin/
│       └── page.tsx                  # /admin → Control panel
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx               # Left nav — collapsible
│   │   ├── TopBar.tsx                # Status: model, tasks, agents, WS, uptime
│   │   └── PageWrapper.tsx           # Page container
│   │
│   ├── consciousness/                # / page components
│   │   ├── ThoughtNebula.tsx         # D3 force graph — thought clusters
│   │   ├── ThoughtCluster.tsx        # Single cluster node
│   │   ├── LiveThoughtFeed.tsx       # Scrolling real-time THOUGHT stream
│   │   ├── ThoughtEntry.tsx          # Single thought line
│   │   └── ConceptGraph.tsx          # Connections between topics
│   │
│   ├── mind/                         # /mind page components
│   │   ├── KnowledgeMap.tsx          # D3 radial tree — knowledge domains
│   │   ├── ObjectivesList.tsx        # Active objectives with progress
│   │   ├── ObjectiveCard.tsx         # Single objective
│   │   └── LearningFeed.tsx          # What Morgoth is currently learning
│   │
│   ├── evolution/                    # /evolution page components
│   │   ├── EvolutionTimeline.tsx     # Chronological growth chart
│   │   ├── SelfModifyLog.tsx         # Self-modification history table
│   │   ├── SelfModifyEntry.tsx       # Single modification with diff
│   │   ├── CapabilityList.tsx        # Tools + agents created over time
│   │   └── GrowthMetrics.tsx         # Counters: tools, agents, knowledge nodes
│   │
│   ├── warroom/                      # /warroom page components
│   │   ├── AgentGrid.tsx             # Live grid of all agents
│   │   ├── AgentCard.tsx             # Single agent — status, mission, model
│   │   ├── AgentLogDrawer.tsx        # Slide-out log per agent
│   │   ├── CreateAgentModal.tsx      # Create new agent
│   │   └── MissionFeed.tsx           # Live feed of agent actions
│   │
│   ├── chat/                         # /chat page components
│   │   ├── ChatWindow.tsx            # Message history
│   │   ├── MessageBubble.tsx         # Single message — markdown rendered
│   │   ├── ChatInput.tsx             # Send bar
│   │   └── ThoughtStream.tsx         # Collapsible right panel — live thoughts
│   │
│   ├── admin/                        # /admin page components
│   │   ├── PermissionsEditor.tsx     # Toggle switches for MORGOTH_PERMS
│   │   └── ModelSelector.tsx         # Ollama model config
│   │
│   └── ui/                           # shadcn/ui primitives
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
│   ├── ws-client.ts                  # WebSocket singleton + reconnect
│   ├── api.ts                        # Typed REST wrapper
│   ├── store/
│   │   ├── brain.store.ts            # Brain status, logs, tasks
│   │   ├── consciousness.store.ts    # Thought clusters, concept graph
│   │   ├── mind.store.ts             # Objectives, knowledge domains
│   │   ├── agents.store.ts           # Agents list + status
│   │   └── chat.store.ts             # Conversation history
│   └── utils/
│       ├── format.ts                 # formatUptime, formatTimestamp etc.
│       ├── colors.ts                 # levelToColor, statusToColor
│       └── thought-clustering.ts     # Group thoughts by topic/keyword
│
├── hooks/
│   ├── useWebSocket.ts               # WS + store population
│   ├── useBrainStatus.ts             # Brain status polling
│   ├── useObjectives.ts              # Objectives CRUD
│   ├── useAgents.ts                  # Agents CRUD
│   └── useSelfModifications.ts       # Self-modify history
│
├── types/
│   └── morgoth.ts                    # All TypeScript types
│
├── tailwind.config.mjs
├── next.config.mjs
├── tsconfig.json
├── .env.local
└── package.json
```

---

## 3. Design System

### 3.1 Color Palette

```typescript
colors: {
  background:    "#0a0a0f",
  surface:       "#111118",
  surface2:      "#1a1a24",
  border:        "#2a2a3a",
  primary:       "#7c3aed",    // violet — Morgoth identity
  primaryGlow:   "#7c3aed33",

  // Thought/log levels
  thought:       "#6b7280",    // gray
  action:        "#3b82f6",    // blue
  result:        "#10b981",    // green
  error:         "#ef4444",    // red
  system:        "#f59e0b",    // amber

  // Knowledge domains (for nebula nodes)
  domainCode:    "#8b5cf6",    // purple
  domainResearch:"#06b6d4",    // cyan
  domainFinance: "#10b981",    // green
  domainSystem:  "#f59e0b",    // amber
  domainOther:   "#6b7280",    // gray

  textPrimary:   "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted:     "#475569",
}
```

### 3.2 Typography
- Data, logs, IDs, timestamps → `font-mono` (JetBrains Mono)
- Labels, descriptions, navigation → `font-sans` (Inter)

### 3.3 Layout
```
┌─────────────────────────────────────────┐
│  TopBar — model, tasks, agents, WS      │ h-12
├──────────┬──────────────────────────────┤
│ Sidebar  │  Page Content                │
│  w-56    │  flex-1 overflow-y-auto      │
│ (collaps)│                              │
└──────────┴──────────────────────────────┘
```

---

## 4. Pages Specification

### 4.1 Consciousness — `/` (HOME)

**Purpose**: Real-time window into what Morgoth is thinking.

**Layout**:
```
┌────────────────────────┬──────────────────┐
│                        │                  │
│  ThoughtNebula         │  LiveThoughtFeed │
│  (D3 force graph)      │  (scrolling)     │
│  70% width             │  30% width       │
│                        │                  │
├────────────────────────┴──────────────────┤
│  ConceptGraph (connections between topics) │
└────────────────────────────────────────────┘
```

**ThoughtNebula**:
- D3 force-directed graph
- Each node = a topic cluster (code, research, finance, system, optimization...)
- Node size = number of thoughts on that topic
- Node color = domain color from design system
- Nodes pulse gently when new thoughts arrive on that topic
- Hover → shows last 3 thoughts on that topic
- Click → filters LiveThoughtFeed to that topic

**LiveThoughtFeed**:
- Real-time stream of THOUGHT level WebSocket events
- Most recent at top
- Each entry: timestamp (mono) + content
- Color-coded by detected topic
- Fades older entries (opacity decreases with age)
- Search/filter bar at top

**ConceptGraph**:
- Connections between topics that co-occur in Morgoth's thoughts
- Thicker lines = stronger association
- Updates in real time
- Collapsible section

**Data sources**:
- WS stream filtered to `type: "thought"` → ThoughtNebula + LiveThoughtFeed
- `GET /api/brain/status` → TopBar
- `GET /api/consciousness/clusters` → ThoughtNebula (backend aggregation)

---

### 4.2 Mind — `/mind`

**Purpose**: Morgoth's knowledge structure and active objectives.

**Layout**: Two columns

```
┌───────────────────────┬──────────────────┐
│  KnowledgeMap         │  ObjectivesList  │
│  (D3 radial tree)     │  + LearningFeed  │
│  60% width            │  40% width       │
└───────────────────────┴──────────────────┘
```

**KnowledgeMap**:
- D3 radial/hierarchical tree
- Root node = Morgoth
- Branches = knowledge domains
- Leaf nodes = specific topics/facts
- Color by domain
- Node opacity = confidence level
- Hover = show fact count + last updated

**ObjectivesList**:
- Active objectives from `GET /api/objectives`
- Each ObjectiveCard shows:
  - Title + category badge
  - Status (PENDING / IN_PROGRESS / COMPLETED / FAILED)
  - Progress bar if applicable
  - Generated by (morgoth / human)
  - Created at timestamp
- Sorted by priority
- Filter by category and status

**LearningFeed**:
- What Morgoth is actively researching right now
- Pulled from ACTION level WS events related to research tools
- Shows tool used + query + result summary

---

### 4.3 Evolution — `/evolution`

**Purpose**: How Morgoth has grown over time.

**Layout**: Vertical sections

```
┌──────────────────────────────────────────┐
│  GrowthMetrics (4 counters)              │
├──────────────────────────────────────────┤
│  EvolutionTimeline (Recharts area chart) │
├──────────────────────────────────────────┤
│  SelfModifyLog (table with diffs)        │
├──────────────────────────────────────────┤
│  CapabilityList (tools + agents added)   │
└──────────────────────────────────────────┘
```

**GrowthMetrics** — 4 cards:
- Total self-modifications applied
- Tools created by Morgoth
- Agents spawned (lifetime)
- Knowledge nodes acquired

**EvolutionTimeline**:
- Recharts AreaChart
- X axis = time
- Lines: self-modifications, new tools, new agents, knowledge nodes
- Time range selector: 7D / 30D / ALL

**SelfModifyLog**:
- Table: timestamp, file, reason, test result badge (PASS/FAIL)
- Click row → expands to show full diff (green/red syntax highlighted)
- Most recent first

**CapabilityList**:
- Chronological list of new tools and agents Morgoth created itself
- Badge: TOOL or AGENT
- Name, creation date, description

---

### 4.4 War Room — `/warroom`

**Purpose**: Live view of all agents and their missions.

**Layout**:
```
┌──────────────────────────────┬──────────────┐
│  AgentGrid                   │  MissionFeed │
│  (cards for all agents)      │  (live logs) │
│  70% width                   │  30% width   │
└──────────────────────────────┴──────────────┘
│  [+ Create Agent] button                    │
└─────────────────────────────────────────────┘
```

**AgentCard**:
- Name + type badge (EPHEMERAL / PERSISTENT)
- Status badge (RUNNING / IDLE / FAILED)
- Current mission (truncated, updates live)
- Model being used
- Uptime counter
- [View Logs] → opens AgentLogDrawer
- [Stop] → only for PERSISTENT agents

**MissionFeed**:
- Live stream of ACTION + RESULT events from all agents
- Each entry: agent name badge + content
- Color by agent type
- Auto-scroll with pause on hover

**CreateAgentModal**:
- Name, type toggle, model dropdown, task textarea, tools checkboxes

---

### 4.5 Direct Link — `/chat`

**Purpose**: Conversational interface with Morgoth.

**Layout**:
```
┌────────────────────────────┬───────────────┐
│  ChatWindow                │  ThoughtStream│
│  (messages)                │  (collapsible)│
├────────────────────────────┴───────────────┤
│  ChatInput                                 │
└────────────────────────────────────────────┘
```

- User messages: right-aligned, surface2 bg
- Morgoth messages: left-aligned, violet left border, markdown rendered
- Code blocks: syntax highlighted, monospace
- ThoughtStream: ambient THOUGHT stream while Morgoth processes
- Send on Enter, Shift+Enter for newline

---

### 4.6 Admin — `/admin`

**Purpose**: Control Morgoth's permissions and model config.

- Permissions toggles (read/write MORGOTH_PERMS.json)
- Warning modal for sensitive permissions (can_self_modify, can_place_real_orders)
- Model configuration (primary + agent model dropdowns)
- Connection test button

---

## 5. New Backend Endpoints Required

The Consciousness and Mind pages require new backend endpoints.
These must be added to `morgoth/api/routes/` as part of this refactor.

```
GET /api/consciousness/clusters
    Returns thought clusters aggregated from recent logs
    Response: { clusters: [{ topic, count, last_thought, color_domain }] }

GET /api/consciousness/concepts
    Returns concept co-occurrence graph
    Response: { nodes: [{ id, label, domain }], edges: [{ source, target, weight }] }

GET /api/objectives
    Returns all objectives
    Response: { items: [Objective] }

POST /api/objectives
    Create a new objective (human-generated)
    Body: { title, description, category, priority }

PATCH /api/objectives/{id}
    Update objective status

GET /api/evolution/metrics
    Returns growth counters
    Response: { self_modifications, tools_created, agents_spawned, knowledge_nodes }

GET /api/evolution/timeline
    Returns time-series growth data
    Response: { points: [{ timestamp, self_mods, tools, agents, knowledge }] }
```

---

## 6. New Zustand Stores

### consciousness.store.ts
```typescript
interface ConsciousnessStore {
  clusters: ThoughtCluster[]
  concepts: ConceptGraph
  liveThoughts: ThoughtEntry[]
  selectedTopic: string | null
  setClusters: (c: ThoughtCluster[]) => void
  addThought: (t: ThoughtEntry) => void      // max 200 in memory
  setSelectedTopic: (t: string | null) => void
}
```

### mind.store.ts
```typescript
interface MindStore {
  objectives: Objective[]
  knowledgeDomains: KnowledgeDomain[]
  setObjectives: (o: Objective[]) => void
  updateObjective: (id: string, update: Partial<Objective>) => void
  setKnowledgeDomains: (d: KnowledgeDomain[]) => void
}
```

---

## 7. New TypeScript Types

```typescript
export interface ThoughtCluster {
  topic: string
  count: number
  last_thought: string
  color_domain: "code" | "research" | "finance" | "system" | "other"
}

export interface ConceptGraph {
  nodes: Array<{ id: string; label: string; domain: string; weight: number }>
  edges: Array<{ source: string; target: string; weight: number }>
}

export interface ThoughtEntry {
  id: string
  timestamp: string
  content: string
  topic: string
  agent: string
}

export interface Objective {
  objective_id: string
  title: string
  description: string
  category: "research" | "capability" | "monitoring" | "optimization"
  priority: number
  generated_by: "morgoth" | "human"
  status: "pending" | "in_progress" | "completed" | "failed"
  evidence: Record<string, unknown>
  created_at: string
  completed_at: string | null
}

export interface KnowledgeDomain {
  domain: string
  fact_count: number
  confidence: number
  last_updated: string
  subtopics: string[]
}

export interface EvolutionMetrics {
  self_modifications: number
  tools_created: number
  agents_spawned: number
  knowledge_nodes: number
}

export interface EvolutionPoint {
  timestamp: string
  self_mods: number
  tools: number
  agents: number
  knowledge: number
}
```

---

## 8. Sidebar Navigation

```typescript
const NAV_ITEMS = [
  { href: "/",          icon: Brain,          label: "Consciousness" },
  { href: "/mind",      icon: Network,        label: "Mind"          },
  { href: "/evolution", icon: TrendingUp,     label: "Evolution"     },
  { href: "/warroom",   icon: Bot,            label: "War Room"      },
  { href: "/chat",      icon: MessageSquare,  label: "Direct Link"   },
  { href: "/admin",     icon: Settings,       label: "Control"       },
]
```

---

## 9. WebSocket Event Routing (updated)

```typescript
wsClient.on("*", (msg: WSMessage) => {
  // All events go to brain logs
  brainStore.addLog(toLogEntry(msg))

  switch (msg.type) {
    case "thought":
      consciousnessStore.addThought(toThoughtEntry(msg))
      break
    case "agent_update":
      agentsStore.updateAgent(msg.agent_id!, msg.metadata as Partial<Agent>)
      break
    case "result":
      if (msg.agent_id === "morgoth_core") {
        chatStore.addMessage({ role: "morgoth", content: msg.content })
        chatStore.setThinking(false)
      }
      break
  }
})
```

---

## 10. Migration from v1.0

### Files to DELETE
- `app/market/page.tsx`
- `components/market/*` (all 4 files)
- `lib/store/market.store.ts`
- `hooks/useMarketData.ts`
- `components/dashboard/MarketOverviewCard.tsx`

### Files to ADD
All files listed in section 2 under `consciousness/`, `mind/`, `evolution/`, `warroom/`.

### Files to KEEP (unchanged)
- All `components/ui/*`
- `components/chat/*`
- `components/admin/*`
- `lib/ws-client.ts`
- `lib/api.ts` (add new endpoints)
- `lib/utils/*`
- `types/morgoth.ts` (extend, don't replace)
- `app/chat/page.tsx`
- `app/admin/page.tsx`

### Files to MODIFY
- `app/page.tsx` → replace dashboard with Consciousness
- `app/layout.tsx` → update providers to include new stores
- `components/layout/Sidebar.tsx` → update nav items
- `lib/store/brain.store.ts` → keep, no changes needed
- `lib/store/agents.store.ts` → keep, no changes needed
- `lib/store/chat.store.ts` → keep, no changes needed

---

## 11. Codex Instructions

### Phase 2b — UI Refactor

**Step 1 — Backend new endpoints** (in morgoth/)
Add to `morgoth/api/routes/consciousness.py`:
- `GET /api/consciousness/clusters` — aggregate recent THOUGHT logs by topic
- `GET /api/consciousness/concepts` — co-occurrence graph from log content

Add to `morgoth/api/routes/objectives.py`:
- `GET /api/objectives`
- `POST /api/objectives`
- `PATCH /api/objectives/{id}`

Add to `morgoth/api/routes/evolution.py`:
- `GET /api/evolution/metrics`
- `GET /api/evolution/timeline`

Register all new routers in `morgoth/api/server.py`.

**Step 2 — New types** (in morgoth_ui/)
Extend `types/morgoth.ts` with all types from section 7.

**Step 3 — New stores**
Add `lib/store/consciousness.store.ts` and `lib/store/mind.store.ts`.

**Step 4 — New hooks**
Add `hooks/useObjectives.ts`, `hooks/useSelfModifications.ts`.
Update `hooks/useWebSocket.ts` to route `thought` events to consciousness store.

**Step 5 — New components** (in order)
Build all components in `consciousness/`, `mind/`, `evolution/`, `warroom/`.

**Step 6 — New pages**
Build `app/page.tsx`, `app/mind/page.tsx`, `app/evolution/page.tsx`, `app/warroom/page.tsx`.

**Step 7 — Cleanup**
Delete market files. Update sidebar. Update layout providers.

**Step 8 — Verify**
`node_modules/.bin/tsc --noEmit` must pass.
Start `npm run dev` — verify all 6 pages load without errors.

### Code Rules
- TypeScript strict, no `any`
- Tailwind only, no inline styles
- Named exports only
- Skeleton loading for all data components
- D3 components must handle empty data gracefully
- Never hardcode agent names, tool names, or topic lists

---

*End of SPEC_UI.md v2.0*  
*Previous: v1.0 — crypto dashboard*  
*This revision: consciousness viewer — the mind of Morgoth*