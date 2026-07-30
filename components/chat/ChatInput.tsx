"use client";

import { Loader2, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { wsClient } from "@/lib/ws-client";
import { useBrainStore } from "@/lib/store/brain.store";
import { useChatStore } from "@/lib/store/chat.store";

// Watchdog: if the WS `result` never lands (backend crashed mid-cycle,
// broadcast dropped, agent_id != morgoth_core), isThinking would stay
// true forever and wedge the textarea. Reset after 60s so the user
// can try again.
const THINKING_WATCHDOG_MS = 60_000;

export function ChatInput() {
  const [value, setValue] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const addMessage = useChatStore((state) => state.addMessage);
  const isThinking = useChatStore((state) => state.isThinking);
  const setThinking = useChatStore((state) => state.setThinking);
  const connectionStatus = useBrainStore((state) => state.connectionStatus);
  const rows = useMemo(() => Math.min(Math.max(value.split("\n").length, 1), 6), [value]);
  const userId = "default";
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isThinking) {
      watchdogRef.current = setTimeout(() => {
        setThinking(false);
      }, THINKING_WATCHDOG_MS);
    }
    return () => {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
    };
  }, [isThinking, setThinking]);

  // WS-only send. The REST fallback was removed: /api/chat exists but
  // its POST also fires the log-broadcast internally, which added the
  // assistant reply twice. Worse, sendMessageMutation.isPending was
  // baked into `disabled`, locking the textarea for the 30-60s of a
  // synchronous REST call. WS is now the single source of truth.
  //
  // `disabled` depends ONLY on transient states with a bounded exit:
  //   - connectionStatus !== "CONNECTED"  → the ws-client is reconnecting
  //     (exponential backoff; never a permanent lock)
  //   - isThinking                        → cleared by the WS `result`
  //     handler in useWebSocket (line 104), or by the 60s watchdog above
  // No external REST state ever gates the input.
  const connected = connectionStatus === "CONNECTED";
  const inputLocked = !connected || isThinking;

  function handleSubmit() {
    const content = value.trim();
    if (!content || inputLocked) {
      return;
    }
    const timestamp = new Date().toISOString();
    addMessage({
      id: `${timestamp}-user`,
      role: "user",
      content,
      timestamp,
    });
    setValue("");
    setSendError(null);
    setThinking(true);
    try {
      wsClient.send({ type: "chat", content, user_id: userId });
    } catch (err) {
      // The connect check above should make this near-impossible; keep
      // a visible message + release isThinking so the user can retry.
      setThinking(false);
      setSendError(
        err instanceof Error
          ? `Send failed: ${err.message}. Reconnecting …`
          : "Send failed. Reconnecting …",
      );
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      {sendError ? (
        <div className="mb-3 rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">
          {sendError}
        </div>
      ) : null}
      {!connected ? (
        <div className="mb-3 rounded-lg border border-system/40 bg-system/10 p-3 text-xs text-system">
          Reconnecting to Morgoth …
        </div>
      ) : null}
      <div className="flex gap-3">
        <textarea
          value={value}
          rows={rows}
          disabled={inputLocked}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={
            connected
              ? "Send Morgoth a task, question, or directive..."
              : "Waiting for the WebSocket to reconnect …"
          }
          className="max-h-36 min-h-10 flex-1 resize-none rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        />
        <Button type="button" onClick={handleSubmit} disabled={!value.trim() || inputLocked}>
          {isThinking ? (
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
