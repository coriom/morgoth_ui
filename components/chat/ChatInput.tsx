"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/ws-client";
import { useBrainStore } from "@/lib/store/brain.store";
import { useChatStore } from "@/lib/store/chat.store";

export function ChatInput() {
  const [value, setValue] = useState("");
  const addMessage = useChatStore((state) => state.addMessage);
  const isThinking = useChatStore((state) => state.isThinking);
  const setThinking = useChatStore((state) => state.setThinking);
  const connectionStatus = useBrainStore((state) => state.connectionStatus);
  const rows = useMemo(() => Math.min(Math.max(value.split("\n").length, 1), 6), [value]);
  const userId = "default";

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => api.chat.send(content, userId),
    onSuccess: (message) => {
      addMessage(message);
      setThinking(false);
    },
    onError: () => {
      setThinking(false);
    },
  });

  function handleSubmit() {
    const content = value.trim();
    if (!content || isThinking || sendMessageMutation.isPending) {
      return;
    }

    const timestamp = new Date().toISOString();
    addMessage({
      id: `${timestamp}-user`,
      role: "user",
      content,
      timestamp,
    });
    setThinking(true);
    setValue("");
    if (connectionStatus === "CONNECTED") {
      try {
        wsClient.send({ type: "chat", content, user_id: userId });
        return;
      } catch {
        sendMessageMutation.mutate(content);
        return;
      }
    }

    sendMessageMutation.mutate(content);
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      {sendMessageMutation.isError ? (
        <div className="mb-3 rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">
          Message send failed. The request did not reach the backend.
        </div>
      ) : null}
      <div className="flex gap-3">
        <textarea
          value={value}
          rows={rows}
          disabled={isThinking || sendMessageMutation.isPending}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Send Morgoth a task, question, or directive..."
          className="max-h-36 min-h-10 flex-1 resize-none rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <Button type="button" onClick={handleSubmit} disabled={!value.trim() || isThinking || sendMessageMutation.isPending}>
          {isThinking || sendMessageMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
