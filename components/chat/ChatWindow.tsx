"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MessageBubble } from "@/components/chat/MessageBubble";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChatMessage } from "@/types/morgoth";

function ChatWindowSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex justify-start">
          <div className="h-16 w-2/3 rounded-lg bg-surface2" />
        </div>
      ))}
    </div>
  );
}

export function ChatWindow({
  messages,
  isLoading,
  className,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  /**
   * Override the Card height. Default `min-h-[70vh]` fits the
   * standalone /chat page (Direct Link). The cockpit passes a
   * `min-h-0 flex-1` variant so ChatInput stays above the fold —
   * before the override, ChatWindow's fixed 70vh pushed ChatInput
   * below the viewport on the cockpit, which read as "chat is dead:
   * cannot type/send" from the operator's perspective.
   */
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const renderedMessages = useMemo(() => messages, [messages]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [autoScroll, renderedMessages]);

  return (
    <Card className={className ?? "flex min-h-[70vh] flex-col"}>
      <CardHeader>
        <CardTitle>Chat Window</CardTitle>
        <p className="text-sm text-textSecondary">
          Live conversation stream with auto-scroll that pauses when you inspect older context.
        </p>
      </CardHeader>
      <CardContent
        ref={containerRef}
        onScroll={(event) => {
          const target = event.currentTarget;
          const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 64;
          setAutoScroll(nearBottom);
        }}
        className="flex-1 space-y-4 overflow-y-auto"
      >
        {isLoading ? <ChatWindowSkeleton /> : null}
        {!isLoading && renderedMessages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            No conversation history yet. Send a prompt to wake Morgoth.
          </div>
        ) : null}
        {!isLoading
          ? renderedMessages.map((message) => <MessageBubble key={message.id} message={message} />)
          : null}
      </CardContent>
    </Card>
  );
}
