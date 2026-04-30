export type LogLevel = "THOUGHT" | "ACTION" | "RESULT" | "ERROR" | "SYSTEM";
export type AgentType = "ephemeral" | "persistent";
export type AgentStatus = "idle" | "running" | "paused" | "completed" | "failed";
export type AgentSpecialization = "general" | "research" | "sentiment" | "macro";
export type TaskPriority = 0 | 1 | 2 | 3;
export type TaskType = "one_shot" | "recurring" | "triggered";
export type TaskStatus = "pending" | "running" | "completed" | "failed";
export type MarketRange = "1D" | "7D" | "30D" | "90D";
export type ConnectionStatus = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
export type ThoughtColorDomain = "code" | "research" | "finance" | "system" | "other";
export type ObjectiveCategory = "research" | "capability" | "monitoring" | "optimization";
export type ObjectiveStatus = "pending" | "in_progress" | "completed" | "failed" | "blocked";
export type WSMessageType =
  | "thought"
  | "action"
  | "result"
  | "error"
  | "agent_update"
  | "system";

export interface LogEntry {
  log_id: string;
  timestamp: string;
  level: LogLevel;
  agent: string;
  content: string;
  tokens_used: number | null;
  duration_ms: number | null;
  user_id: string;
}

export interface Agent {
  agent_id: string;
  name: string;
  agent_type: AgentType;
  status: AgentStatus;
  model: string;
  tools: string[];
  created_at: string;
  user_id: string;
  stopped_at?: string | null;
  current_task?: string | null;
  last_error?: string | null;
  specialization?: AgentSpecialization;
}

export interface Task {
  task_id: string;
  type: TaskType;
  priority: TaskPriority;
  description: string;
  agent_id: string | null;
  created_by: string;
  created_at: string;
  scheduled_at: string | null;
  recurrence_cron: string | null;
  status: TaskStatus;
  result: Record<string, unknown> | null;
  user_id: string;
}

export interface PriceData {
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
  volume_24h: number;
  market_cap: number;
  last_updated: string;
  rank?: number | null;
  sparkline?: number[];
}

export interface PricePoint {
  timestamp: string;
  price: number;
  volume: number;
}

export interface BrainStatus {
  ready: boolean;
  primary_model: string;
  agent_model: string;
  max_concurrent_agents: number;
}

export interface ThoughtCluster {
  topic: string;
  count: number;
  last_thought: string;
  color_domain: ThoughtColorDomain;
}

export interface ConceptGraphNode {
  id: string;
  label: string;
  domain: string;
  weight: number;
}

export interface ConceptGraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface ConceptGraph {
  nodes: ConceptGraphNode[];
  edges: ConceptGraphEdge[];
}

export interface ThoughtEntry {
  id: string;
  timestamp: string;
  content: string;
  topic: string;
  agent: string;
}

export interface Objective {
  objective_id: string;
  title: string;
  description: string;
  category: ObjectiveCategory;
  priority: number;
  generated_by: "morgoth" | "human";
  status: ObjectiveStatus;
  evidence: Array<Record<string, unknown>> | Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

export interface KnowledgeDomain {
  domain: string;
  fact_count: number;
  confidence: number;
  last_updated: string;
  subtopics: string[];
}

export interface EvolutionMetrics {
  self_modifications: number;
  tools_created: number;
  agents_spawned: number;
  knowledge_nodes: number;
}

export interface EvolutionPoint {
  timestamp: string;
  self_mods: number;
  tools: number;
  agents: number;
  knowledge: number;
}

export interface SelfModification {
  mod_id: string;
  timestamp: string;
  file_path: string;
  diff: string;
  reason: string;
  test_result: {
    passed: boolean;
    output: string;
  };
  approved_by: string;
}

export interface Permissions {
  can_create_ephemeral_agents: boolean;
  can_create_persistent_agents: boolean;
  can_self_modify: boolean;
  can_store_secrets: boolean;
  can_pull_ollama_models: boolean;
  can_execute_code: boolean;
  can_write_files: boolean;
  can_send_notifications: boolean;
  can_access_internet: boolean;
  can_place_real_orders: boolean;
}

export interface PermissionsMetadata {
  version: string;
  updated_by: string;
}

export interface PermissionsResponse {
  version: string;
  permissions: Permissions;
  metadata: PermissionsMetadata;
  evolvable_zone_paths: string[];
  immutable_zone_paths: string[];
  notification_levels: {
    INFO: string[];
    WARNING: string[];
    CRITICAL: string[];
  };
  task_limits: {
    max_concurrent_agents: number;
    max_recurring_tasks: number;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "morgoth";
  content: string;
  timestamp: string;
}

export interface CreateAgentPayload {
  name: string;
  agent_type: AgentType;
  model?: string;
  task: string;
  tools: string[];
  user_id?: string;
}

export interface LogQueryParams {
  level?: LogLevel[];
  agent?: string;
  range?: string;
  search?: string;
}

export interface MarketStats {
  total_market_cap: number | null;
  btc_dominance: number | null;
  eth_dominance: number | null;
  fear_and_greed_index?: number | null;
  last_updated: string;
}

export interface FredSeriesSummary {
  series_id: string;
  title: string;
  frequency: string | null;
  units: string | null;
  seasonal_adjustment: string | null;
  popularity: number | null;
}

export interface FredObservation {
  date: string;
  value: number | null;
  realtime_start: string | null;
  realtime_end: string | null;
}

export interface FredSeriesObservationsResult {
  series_id: string;
  observations: FredObservation[];
}

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  author: string | null;
  score: number;
  comments: number;
  url: string;
  permalink: string;
  created_utc: number | null;
  selftext: string;
}

export interface MovingAverageSnapshot {
  short_period: number;
  long_period: number;
  short_sma: number | null;
  long_sma: number | null;
  short_ema: number | null;
  long_ema: number | null;
}

export interface MacdSnapshot {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export interface TechnicalAnalysisSnapshot {
  sample_size: number;
  latest_price: number | null;
  rsi_period: number;
  rsi: number | null;
  moving_averages: MovingAverageSnapshot;
  macd: MacdSnapshot;
  trend: "bullish" | "bearish" | "mixed";
}

export interface ModelConfig {
  primary_model: string;
  agent_model: string;
  max_concurrent_agents: number;
  available_models: string[];
}

export interface AdminSettingsResponse {
  permissions: Permissions;
  metadata: PermissionsMetadata;
  models: ModelConfig;
}

export interface WSMessage {
  type: WSMessageType;
  timestamp: string;
  agent_id: string | null;
  content: string;
  metadata: Record<string, unknown>;
}

export interface WSOutboundMessage {
  type: "chat" | "command";
  content: string;
  user_id: string;
}
