import type { ConnectionStatus, WSMessage, WSOutboundMessage } from "@/types/morgoth";

type MessageListener = (data: WSMessage) => void;
type StatusListener = (status: ConnectionStatus, attempt: number) => void;

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/chat";

class MorgothWSClient {
  private socket: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private listeners = new Map<string, Set<MessageListener>>();
  private statusListeners = new Set<StatusListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;
  private reconnectAttempt = 0;
  private status: ConnectionStatus = "DISCONNECTED";

  connect(): void {
    if (typeof window === "undefined") {
      return;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.manualDisconnect = false;
    this.updateStatus(this.reconnectAttempt > 0 ? "RECONNECTING" : "DISCONNECTED");
    this.socket = new WebSocket(WS_URL);

    this.socket.addEventListener("open", () => {
      this.reconnectDelay = 1000;
      this.reconnectAttempt = 0;
      this.updateStatus("CONNECTED");
    });

    this.socket.addEventListener("message", (event) => {
      const payload = this.parseMessage(event.data);
      if (!payload) {
        return;
      }

      this.updateStatus("CONNECTED");
      this.notify("*", payload);
      this.notify(payload.type, payload);
    });

    this.socket.addEventListener("close", () => {
      this.socket = null;
      if (!this.manualDisconnect) {
        this.reconnect();
      } else {
        this.updateStatus("DISCONNECTED");
      }
    });

    this.socket.addEventListener("error", () => {
      this.socket?.close();
    });
  }

  disconnect(): void {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.updateStatus("DISCONNECTED");
  }

  send(message: WSOutboundMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected.");
    }

    this.socket.send(JSON.stringify(message));
  }

  on(type: string, callback: MessageListener): () => void {
    const current = this.listeners.get(type) ?? new Set<MessageListener>();
    current.add(callback);
    this.listeners.set(type, current);

    return () => {
      const scoped = this.listeners.get(type);
      scoped?.delete(callback);
      if (scoped && scoped.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  onStatus(callback: StatusListener): () => void {
    this.statusListeners.add(callback);
    callback(this.status, this.reconnectAttempt);

    return () => {
      this.statusListeners.delete(callback);
    };
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getReconnectAttempt(): number {
    return this.reconnectAttempt;
  }

  private reconnect(): void {
    this.reconnectAttempt += 1;
    this.updateStatus("RECONNECTING");
    this.reconnectTimer = setTimeout(() => {
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  private notify(type: string, payload: WSMessage): void {
    this.listeners.get(type)?.forEach((listener) => {
      listener(payload);
    });
  }

  private updateStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener) => {
      listener(status, this.reconnectAttempt);
    });
  }

  private parseMessage(input: unknown): WSMessage | null {
    if (typeof input !== "string") {
      return null;
    }

    try {
      const parsed = JSON.parse(input) as Partial<WSMessage>;
      if (
        typeof parsed.type === "string" &&
        typeof parsed.timestamp === "string" &&
        typeof parsed.content === "string"
      ) {
        return {
          type: parsed.type as WSMessage["type"],
          timestamp: parsed.timestamp,
          agent_id: typeof parsed.agent_id === "string" ? parsed.agent_id : null,
          content: parsed.content,
          metadata:
            parsed.metadata && typeof parsed.metadata === "object"
              ? (parsed.metadata as Record<string, unknown>)
              : {},
        };
      }
    } catch {
      return null;
    }

    return null;
  }
}

export const wsClient = new MorgothWSClient();
