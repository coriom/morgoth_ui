"use client";

import { useEffect } from "react";

import { wsClient } from "@/lib/ws-client";
import { useAgentsStore } from "@/lib/store/agents.store";
import { useBrainStore } from "@/lib/store/brain.store";
import { useChatStore } from "@/lib/store/chat.store";
import { useConsciousnessStore } from "@/lib/store/consciousness.store";
import type { Agent, LogEntry, ThoughtEntry, WSMessage } from "@/types/morgoth";

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
    case "agent_update":
      return "ACTION";
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

function detectTopic(content: string): string {
  const tokens = content
    .toLowerCase()
    .match(/[a-zA-Z][a-zA-Z0-9_-]{2,}/g)
    ?.filter((token) => !["about", "after", "agent", "and", "from", "into", "that", "them", "this", "with"].includes(token));

  return tokens?.[0] ?? "other";
}

function toThoughtEntry(message: WSMessage): ThoughtEntry {
  return {
    id: `${message.timestamp}-thought-${message.agent_id ?? "system"}`,
    timestamp: message.timestamp,
    content: message.content,
    topic: typeof message.metadata.topic === "string" ? message.metadata.topic : detectTopic(message.content),
    agent: message.agent_id ?? "morgoth_core",
  };
}

function toAgentUpdate(message: WSMessage): Partial<Agent> {
  const update = message.metadata as Partial<Agent>;
  return {
    ...update,
    current_task: typeof update.current_task === "string" ? update.current_task : message.content,
  };
}

export function useWebSocket(): void {
  useEffect(() => {
    const brainStore = useBrainStore.getState();
    const agentsStore = useAgentsStore.getState();
    const chatStore = useChatStore.getState();
    const consciousnessStore = useConsciousnessStore.getState();

    const unsubscribeStatus = wsClient.onStatus((status, attempt) => {
      useBrainStore.getState().setConnectionState(status, attempt);
    });

    const unsubscribeAll = wsClient.on("*", (message) => {
      if (["thought", "action", "result", "error", "system", "agent_update"].includes(message.type)) {
        brainStore.addLog(toLogEntry(message));
      }

      switch (message.type) {
        case "thought":
          consciousnessStore.addThought(toThoughtEntry(message));
          break;
        case "agent_update":
          if (message.agent_id) {
            agentsStore.updateAgent(message.agent_id, toAgentUpdate(message));
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
