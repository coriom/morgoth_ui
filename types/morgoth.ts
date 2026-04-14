export type LogLevel = "THOUGHT" | "ACTION" | "RESULT" | "ERROR" | "SYSTEM";
export type AgentType = "ephemeral" | "persistent";
export type AgentStatus = "idle" | "running" | "paused" | "completed" | "failed";
export type TaskPriority = 0 | 1 | 2 | 3;
export type TaskType = "one_shot" | "recurring" | "triggered";
export type TaskStatus = "pending" | "running" | "completed" | "failed";
export type MarketRange = "1D" | "7D" | "30D" | "90D";
export type ConnectionStatus = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
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
