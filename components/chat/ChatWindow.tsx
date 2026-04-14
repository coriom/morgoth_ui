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
}: {
  messages: ChatMessage[];
  isLoading: boolean;
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
    <Card className="flex min-h-[70vh] flex-col">
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
