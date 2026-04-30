import type {
  Agent,
  BrainStatus,
  ChatMessage,
  ConceptGraph,
  CreateAgentPayload,
  EvolutionMetrics,
  EvolutionPoint,
  Objective,
  ObjectiveCategory,
  ObjectiveStatus,
  LogEntry,
  LogQueryParams,
  MarketStats,
  ModelConfig,
  Permissions,
  PermissionsResponse,
  PriceData,
  PricePoint,
  SelfModification,
  ThoughtCluster,
  Task,
} from "@/types/morgoth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Primitive = string | number | boolean | null | undefined;
type QueryValue = Primitive | Primitive[];

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ItemsResponse<T> {
  items: T[];
}

interface ToolExecutionResult<T> {
  success: boolean;
  result: T | null;
  error: string | null;
  metadata: Record<string, unknown>;
}

interface RawMarketPrice {
  symbol: string;
  price: number;
  change_24h?: number | null;
  volume_24h?: number | null;
}

interface RawMarketHistoryPoint {
  timestamp: string;
  price: number;
  volume_24h?: number | null;
}

interface RawPermissionsDocument {
  version: string;
  last_updated_by: string;
  permissions: Permissions;
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

interface RawChatHistoryItem {
  document_id: string;
  content: string;
  metadata: {
    timestamp: string;
    agent_id: string;
    user_id: string;
    category: string;
  };
}

interface RawChatResponse {
  message: string;
  tool_results: Array<Record<string, unknown>>;
  model: string;
}

interface RawEvolutionTimelineResponse {
  points: EvolutionPoint[];
}

interface ObjectiveCreatePayload {
  title: string;
  description: string;
  category: ObjectiveCategory;
  priority: number;
  user_id?: string;
}

interface ObjectiveUpdatePayload {
  status: ObjectiveStatus;
}

const DEFAULT_USER_ID = "default";

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(path, API_BASE);

  if (!query) {
    return url.toString();
  }

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null) {
          url.searchParams.append(key, String(item));
        }
      });
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

async function request<TResponse>(
  path: string,
  init?: RequestInit,
  query?: Record<string, QueryValue>,
): Promise<TResponse> {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ApiError(message || `Request failed with status ${response.status}`, response.status);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

const GET = <TResponse>(path: string, query?: Record<string, QueryValue>) =>
  request<TResponse>(path, { method: "GET" }, query);

const POST = <TResponse, TBody>(path: string, body: TBody) =>
  request<TResponse>(path, { method: "POST", body: JSON.stringify(body) });

const PATCH = <TResponse, TBody>(path: string, body: TBody) =>
  request<TResponse>(path, { method: "PATCH", body: JSON.stringify(body) });

const DELETE = <TResponse>(path: string) => request<TResponse>(path, { method: "DELETE" });

const PRICE_NAME_BY_SYMBOL: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
};

function unwrapItems<T>(response: ItemsResponse<T>): T[] {
  return response.items;
}

function mapPrice(item: RawMarketPrice): PriceData {
  return {
    symbol: item.symbol.toUpperCase(),
    name: PRICE_NAME_BY_SYMBOL[item.symbol.toUpperCase()] ?? item.symbol.toUpperCase(),
    price: item.price,
    change_24h: item.change_24h ?? 0,
    volume_24h: item.volume_24h ?? 0,
    market_cap: 0,
    last_updated: new Date().toISOString(),
    rank: null,
    sparkline: [],
  };
}

function mapHistoryPoint(item: RawMarketHistoryPoint): PricePoint {
  return {
    timestamp: item.timestamp,
    price: item.price,
    volume: item.volume_24h ?? 0,
  };
}

function mapPermissions(response: RawPermissionsDocument) {
  return {
    version: response.version,
    permissions: response.permissions,
    metadata: {
      version: response.version,
      updated_by: response.last_updated_by,
    },
    evolvable_zone_paths: response.evolvable_zone_paths,
    immutable_zone_paths: response.immutable_zone_paths,
    notification_levels: response.notification_levels,
    task_limits: response.task_limits,
  };
}

function mapHistoryLimit(range: string): number {
  switch (range) {
    case "1D":
      return 24;
    case "7D":
      return 50;
    case "30D":
      return 120;
    case "90D":
      return 240;
    default:
      return 50;
  }
}

function mapSelfModification(item: SelfModification): SelfModification {
  return {
    ...item,
    test_result:
      item.test_result && typeof item.test_result === "object"
        ? item.test_result
        : {
            passed: false,
            output: "",
          },
  };
}

export const api = {
  consciousness: {
    clusters: async (): Promise<ThoughtCluster[]> => {
      const response = await GET<{ clusters: ThoughtCluster[] }>("/api/consciousness/clusters");
      return response.clusters;
    },
    concepts: async (): Promise<ConceptGraph> => GET<ConceptGraph>("/api/consciousness/concepts"),
  },
  chat: {
    send: async (content: string, userId: string = DEFAULT_USER_ID): Promise<ChatMessage> => {
      const response = await POST<RawChatResponse, { content: string; user_id: string }>("/api/chat", {
        content,
        user_id: userId,
      });
      return {
        id: `${Date.now()}-morgoth`,
        role: "morgoth",
        content: response.message,
        timestamp: new Date().toISOString(),
      };
    },
    history: async (limit?: number): Promise<ChatMessage[]> => {
      const response = await GET<ItemsResponse<RawChatHistoryItem>>("/api/chat/history", { limit });
      return unwrapItems(response)
        .map((item) => ({
          id: item.document_id,
          role: (item.metadata.category === "chat_user" ? "user" : "morgoth") as ChatMessage["role"],
          content: item.content,
          timestamp: item.metadata.timestamp,
        }))
        .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
    },
  },
  objectives: {
    list: async (): Promise<Objective[]> => unwrapItems(await GET<ItemsResponse<Objective>>("/api/objectives")),
    create: (data: ObjectiveCreatePayload) => POST<Objective, ObjectiveCreatePayload>("/api/objectives", data),
    update: (id: string, data: ObjectiveUpdatePayload) =>
      PATCH<Objective, ObjectiveUpdatePayload>(`/api/objectives/${id}`, data),
  },
  agents: {
    list: async () => unwrapItems(await GET<ItemsResponse<Agent>>("/api/agents")),
    create: (data: CreateAgentPayload) => POST<Agent, CreateAgentPayload>("/api/agents", data),
    get: (id: string) => GET<Agent>(`/api/agents/${id}`),
    delete: (id: string) => DELETE<void>(`/api/agents/${id}`),
  },
  evolution: {
    metrics: () => GET<EvolutionMetrics>("/api/evolution/metrics"),
    timeline: async (): Promise<EvolutionPoint[]> => {
      const response = await GET<RawEvolutionTimelineResponse>("/api/evolution/timeline");
      return response.points;
    },
  },
  market: {
    prices: async (): Promise<PriceData[]> => {
      const response = await GET<ItemsResponse<ToolExecutionResult<RawMarketPrice>>>("/api/market/prices");
      return unwrapItems(response)
        .filter((item) => item.success && item.result !== null)
        .map((item) => mapPrice(item.result as RawMarketPrice));
    },
    history: async (symbol: string, range: string): Promise<PricePoint[]> => {
      const response = await GET<ItemsResponse<RawMarketHistoryPoint>>(`/api/market/history/${symbol}`, {
        limit: mapHistoryLimit(range),
      });
      return unwrapItems(response)
        .map(mapHistoryPoint)
        .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
    },
  },
  brain: {
    status: () => GET<BrainStatus>("/api/brain/status"),
    logs: async (params: LogQueryParams) =>
      unwrapItems(await GET<ItemsResponse<LogEntry>>("/api/brain/logs", params as Record<string, QueryValue>)),
    tasks: async () => unwrapItems(await GET<ItemsResponse<Task>>("/api/brain/tasks")),
    selfModifications: async (): Promise<SelfModification[]> =>
      unwrapItems(await GET<ItemsResponse<SelfModification>>("/api/brain/self-modifications")).map(mapSelfModification),
  },
  admin: {
    permissions: async () => mapPermissions(await GET<RawPermissionsDocument>("/api/admin/permissions")),
    updatePermissions: (data: PermissionsResponse) =>
      PATCH<{ success: boolean }, { payload: RawPermissionsDocument }>("/api/admin/permissions", {
        payload: {
          version: data.version,
          last_updated_by: data.metadata.updated_by,
          permissions: data.permissions,
          evolvable_zone_paths: data.evolvable_zone_paths,
          immutable_zone_paths: data.immutable_zone_paths,
          notification_levels: data.notification_levels,
          task_limits: data.task_limits,
        },
      }),
    models: async (): Promise<ModelConfig> => {
      const response = await GET<BrainStatus>("/api/brain/status");
      return {
        primary_model: response.primary_model,
        agent_model: response.agent_model,
        max_concurrent_agents: response.max_concurrent_agents,
        available_models: [response.primary_model, response.agent_model],
      };
    },
  },
};

export { ApiError };
