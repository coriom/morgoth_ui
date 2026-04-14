"use client";

import { useEffect } from "react";

import { wsClient } from "@/lib/ws-client";
import { useAgentsStore } from "@/lib/store/agents.store";
import { useBrainStore } from "@/lib/store/brain.store";
import { useChatStore } from "@/lib/store/chat.store";
import type { LogEntry, WSMessage } from "@/types/morgoth";

function mapLevel(type: WSMessage["type"]): LogEntry["level"] {
  switch (type) {
    case "thought":
      return "THOUGHT";
    case "action":
      return "ACTION";
    case "result":
      return "RESULT";
    case "error":
      return "ERROR";
    case "system":
      return "SYSTEM";
    default:
      return "SYSTEM";
  }
}

function toLogEntry(message: WSMessage): LogEntry {
  return {
    log_id: `${message.timestamp}-${message.type}-${message.agent_id ?? "system"}`,
    timestamp: message.timestamp,
    level: mapLevel(message.type),
    agent: message.agent_id ?? "morgoth_core",
    content: message.content,
    tokens_used: typeof message.metadata.tokens_used === "number" ? message.metadata.tokens_used : null,
    duration_ms: typeof message.metadata.duration_ms === "number" ? message.metadata.duration_ms : null,
    user_id: typeof message.metadata.user_id === "string" ? message.metadata.user_id : "system",
  };
}

export function useWebSocket(): void {
  useEffect(() => {
    const brainStore = useBrainStore.getState();
    const agentsStore = useAgentsStore.getState();
    const chatStore = useChatStore.getState();

    const unsubscribeStatus = wsClient.onStatus((status, attempt) => {
      useBrainStore.getState().setConnectionState(status, attempt);
    });

    const unsubscribeAll = wsClient.on("*", (message) => {
      if (["thought", "action", "result", "error", "system"].includes(message.type)) {
        brainStore.addLog(toLogEntry(message));
      }

      switch (message.type) {
        case "agent_update":
          if (message.agent_id) {
            agentsStore.updateAgent(message.agent_id, message.metadata as Partial<(typeof agentsStore.agents)[number]>);
          }
          break;
        case "result":
          if (message.agent_id === "morgoth_core") {
            chatStore.addMessage({
              id: `${message.timestamp}-morgoth`,
              role: "morgoth",
              content: message.content,
              timestamp: message.timestamp,
            });
            chatStore.setThinking(false);
          }
          break;
        case "error":
          if (message.agent_id === "morgoth_core") {
            chatStore.setThinking(false);
          }
          break;
        default:
          break;
      }
    });

    wsClient.connect();

    return () => {
      unsubscribeAll();
      unsubscribeStatus();
      wsClient.disconnect();
    };
  }, []);
}
