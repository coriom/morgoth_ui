# PROGRESS.md — Morgoth UI Development Tracker

## Current Status
**Phase**: 3 — Frontend  
**Overall**: 31 / 31 files complete  
**Last updated**: backend/frontend contract verification and integration pass complete  
**Next action**: Investigate the remaining opaque Next.js webpack build failure on this machine after the API contract fixes

## Phase 3 — Frontend (morgoth_ui/)

### Foundation
| File | Status | Notes |
|---|---|---|
| `tailwind.config.ts` | ✅ Done | Added dark-only design tokens, fonts, glow, and layout primitives from spec section 3 |
| `types/morgoth.ts` | ✅ Done | Added strict API, WS, market, admin, and chat contract types |
| `lib/ws-client.ts` | ✅ Done | Built singleton WS client with reconnect backoff and status listeners |
| `lib/api.ts` | ✅ Done | Added typed REST wrapper with shared request/error handling |
| `lib/store/brain.store.ts` | ✅ Done | Added Zustand brain state for status, logs, tasks, mods, and connection |
| `lib/store/market.store.ts` | ✅ Done | Added market price, history, stats, and watchlist Zustand state |
| `lib/store/agents.store.ts` | ✅ Done | Added agents registry state with update and selection helpers |
| `lib/store/chat.store.ts` | ✅ Done | Added chat history and thinking state store |
| `lib/utils/format.ts` | ✅ Done | Added shared number, change, uptime, and timestamp formatters |
| `lib/utils/colors.ts` | ✅ Done | Added log-level and market-change Tailwind color mappings |

### Hooks
| File | Status | Notes |
|---|---|---|
| `hooks/useWebSocket.ts` | ✅ Done | Wired WS events into brain, chat, market, and agents stores with reconnect status |
| `hooks/useMarketData.ts` | ✅ Done | Added market price, stats, and history queries synced into Zustand |
| `hooks/useBrainStatus.ts` | ✅ Done | Added status, tasks, and self-modification queries with refresh cadence |
| `hooks/useAgents.ts` | ✅ Done | Added agents CRUD query layer and store synchronization |

### Layout
| File | Status | Notes |
|---|---|---|
| `app/layout.tsx` | ✅ Done | Replaced starter layout with dark-only app shell, fonts, and providers |
| `components/layout/TopBar.tsx` | ✅ Done | Added live status bar for model, tasks, agents, WS state, and uptime |
| `components/layout/Sidebar.tsx` | ✅ Done | Added collapsible sidebar with spec navigation and active glow state |
| `components/layout/PageWrapper.tsx` | ✅ Done | Added shared page container for dense, consistent content spacing |

### Pages & Components
| File | Status | Notes |
|---|---|---|
| `components/dashboard/*` | ✅ Done | Built five dashboard cards with skeleton, empty, and inline error states |
| `app/page.tsx` | ✅ Done | Composed responsive dashboard grid from live brain, market, agent, and log data |
| `components/chat/*` | ✅ Done | Built message rendering, history window, send input, and live thought stream panel |
| `app/chat/page.tsx` | ✅ Done | Added full chat layout with history query hydration and realtime thoughts panel |
| `components/agents/*` | ✅ Done | Built agent cards, grid, create modal, and filtered log drawer |
| `app/agents/page.tsx` | ✅ Done | Added agent operations page with create, stop, log drawer, and collapsed completed list |
| `components/market/*` | ✅ Done | Built market stats bar, sortable price table, dual-axis chart, and watchlist symbol search |
| `app/market/page.tsx` | ✅ Done | Added full market view with shared range and selected-symbol state |
| `components/brain/*` | ✅ Done | Built log feed, filters, queue lanes, task cards, and self-modification history table |
| `app/brain/page.tsx` | ✅ Done | Added tabbed brain view for logs, task queue, and self-modification history |
| `components/admin/*` | ✅ Done | Built grouped permissions editor with sensitive warnings and model configuration controls |
| `app/admin/page.tsx` | ✅ Done | Added admin page composing permissions and model management sections |

## Decisions Made
| Date | Decision | Reason |
|---|---|---|
| — | — | — |

## Issues & Blockers
| Issue | Status | Notes |
|---|---|---|
| Market prices endpoint returned `{"items": ToolExecutionResult[]}` while UI expected `PriceData[]` | Resolved | `lib/api.ts` now unwraps the outer `items` envelope and each nested tool result before stores/components receive normalized `PriceData[]` |
| Other REST list endpoints returned `{"items": ...}` while UI typed plain arrays | Resolved | Normalized `chat.history`, `agents.list`, `brain.logs`, `brain.tasks`, and `market.history` in `lib/api.ts` to unwrap backend envelopes before they reach hooks |
| Agent creation payload used frontend-only fields (`model`, `task_description`) | Resolved | `CreateAgentPayload` and `CreateAgentModal` now send the backend contract (`name`, `task`, `agent_type`, `tools`, optional `user_id`) |
| Chat POST response returned `BrainResponse`, not `ChatMessage`, and REST chat did not rely on WS echo | Resolved | `api.chat.send` now maps the backend response into a UI `ChatMessage`, and `ChatInput` appends that reply on mutation success |
| Brain status fields in UI did not match `/api/brain/status` | Resolved | `types/morgoth.ts`, `BrainStatusCard`, `TopBar`, and admin model display now follow the backend shape (`ready`, `primary_model`, `agent_model`, `max_concurrent_agents`) |
| UI called backend endpoints that do not exist (`/api/market/stats`, `/api/brain/self-modifications`, `/api/admin/models`) | Resolved | Market stats are now derived locally from backend price payloads, self-modifications resolve to an empty dataset until the backend implements them, and model info is derived from `/api/brain/status` |
| Admin permissions UI expected `{ permissions, metadata }`, but backend returns the full `MORGOTH_PERMS.json` document | Resolved | Permissions reads now map the backend document into UI state, and saves send the full backend patch payload `{ payload: MorgothPermissions }` |
| WebSocket client expected `market_update`, but current backend emits only `thought`, `action`, `result`, `error`, `agent_update`, and `system` | Resolved | Removed the unused `market_update` contract from the WS type union and client handler so the frontend matches the current backend event set |
| Market data hook triggered a maximum update depth loop via repeated store sync | Resolved | `hooks/useMarketData.ts` now syncs Zustand only from `pricesQuery.data` / `historyQuery.data` effects, and the derived `statsData` object is memoized so `setPrices` and `setStats` are not retriggered every render |
| Other query-to-store sync points risked unstable setter/effect dependencies | Resolved | Normalized `useAgents.ts`, `useBrainStatus.ts`, and `app/chat/page.tsx` so store writes run from data-only effects instead of depending on setter references or render-created values |
| `next build` exits with opaque webpack errors | Open | `node_modules/.bin/tsc --noEmit` passes after the integration fixes, but `npm run build` still stops at `Build failed because of webpack errors` without a surfaced module trace on this machine |

## Session Log
| Date | Who | What was done |
|---|---|---|
| Project init | Human | Next.js initialized, SPEC_UI.md added |
| 2026-04-13 | Codex | Foundation bloc complete: design tokens, typed contracts, WS/API layer, Zustand stores, and formatting helpers built; checked against spec section 3 before moving on |
| 2026-04-13 | Codex | Hooks bloc complete: TanStack Query orchestration and WS routing built; self-checked loading/error patterns and dark-only styling assumptions before layout work |
| 2026-04-13 | Codex | Layout bloc complete: root shell, providers, sidebar, top bar, and UI primitives added; verified palette, typography roles, and dark-only navigation treatment against spec section 3 |
| 2026-04-13 | Codex | Dashboard bloc complete: overview cards and dashboard composition added; checked card chrome, mono usage for logs/prices, and alert emphasis against spec section 3 |
| 2026-04-13 | Codex | Chat bloc complete: markdown messages, code blocks, hover timestamps, ambient thought stream, and disabled send states added; corrected initial inline-style drift before moving on |
| 2026-04-13 | Codex | Agents bloc complete: creation flow, stop action, filtered log drawer, and collapsed completed list added; checked status badge mappings and card density against spec section 3 |
| 2026-04-13 | Codex | Market bloc complete: sortable table, dual-axis chart, stats bar, and symbol search added; corrected tooltip styling to stay Tailwind-only before advancing |
| 2026-04-13 | Codex | Brain bloc complete: filtered logs, exports, queue lanes, and self-modification history added; tightened auto-scroll behavior before moving into admin controls |
| 2026-04-13 | Codex | Admin bloc complete: permissions editor, sensitive-toggle confirmation, model controls, and latency test added; corrected overall tracker count to include the previously untracked `components/ui/*` deliverable from spec step 19 |
| 2026-04-13 | Codex | Verification summary: created `tailwind.config.ts`, `types/morgoth.ts`, `lib/ws-client.ts`, `lib/api.ts`, `lib/store/brain.store.ts`, `lib/store/market.store.ts`, `lib/store/agents.store.ts`, `lib/store/chat.store.ts`, `lib/utils/format.ts`, `lib/utils/colors.ts`, `lib/utils/cn.ts`, `hooks/useWebSocket.ts`, `hooks/useMarketData.ts`, `hooks/useBrainStatus.ts`, `hooks/useAgents.ts`, `components/providers.tsx`, `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/badge.tsx`, `components/ui/input.tsx`, `components/ui/select.tsx`, `components/ui/switch.tsx`, `components/ui/dialog.tsx`, `components/ui/drawer.tsx`, `components/ui/table.tsx`, `components/ui/tabs.tsx`, `components/ui/tooltip.tsx`, `components/layout/PageWrapper.tsx`, `components/layout/TopBar.tsx`, `components/layout/Sidebar.tsx`, `components/dashboard/BrainStatusCard.tsx`, `components/dashboard/MarketOverviewCard.tsx`, `components/dashboard/ActiveAgentsCard.tsx`, `components/dashboard/RecentLogsCard.tsx`, `components/dashboard/AlertsFeed.tsx`, `components/chat/MessageBubble.tsx`, `components/chat/ChatWindow.tsx`, `components/chat/ChatInput.tsx`, `components/chat/ThoughtStream.tsx`, `components/agents/AgentCard.tsx`, `components/agents/AgentList.tsx`, `components/agents/CreateAgentModal.tsx`, `components/agents/AgentLogDrawer.tsx`, `components/market/MarketStats.tsx`, `components/market/PriceTable.tsx`, `components/market/PriceChart.tsx`, `components/market/SymbolSearch.tsx`, `components/brain/LogEntry.tsx`, `components/brain/LogFilters.tsx`, `components/brain/LogFeed.tsx`, `components/brain/TaskCard.tsx`, `components/brain/TaskQueue.tsx`, `components/brain/SelfModifyHistory.tsx`, `components/admin/PermissionsEditor.tsx`, `components/admin/ModelSelector.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/chat/page.tsx`, `app/agents/page.tsx`, `app/market/page.tsx`, `app/brain/page.tsx`, `app/admin/page.tsx`, and replaced `app/globals.css`; `tsc --noEmit` passed, but `npm run build` remains blocked by the native SWC crash |
| 2026-04-14 | Codex | Cross-checked `morgoth/api/routes/*` and `api/ws/handler.py` against `morgoth_ui/types/morgoth.ts`, `lib/api.ts`, hooks, and stores; fixed the REST envelope/tool wrapper mismatches, aligned agent/chat/admin payloads, removed frontend assumptions about unimplemented backend endpoints, and updated the WS event union to the current emitted set; `node_modules/.bin/tsc --noEmit` passes, while `npm run build` now still fails with a generic webpack error on this machine |
| 2026-04-14 | Codex | Fixed the infinite store sync loop by reducing query-to-Zustand effects to data-only dependencies in `hooks/useMarketData.ts`, `hooks/useAgents.ts`, `hooks/useBrainStatus.ts`, and `app/chat/page.tsx`; memoized derived market stats to avoid recreating effect dependencies each render; `node_modules/.bin/tsc --noEmit` passes after the fix |
