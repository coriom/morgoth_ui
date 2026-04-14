"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { ChatInput } from "@/components/chat/ChatInput";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ThoughtStream } from "@/components/chat/ThoughtStream";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { api } from "@/lib/api";
import { useBrainStore } from "@/lib/store/brain.store";
import { useChatStore } from "@/lib/store/chat.store";

export default function ChatPage() {
  const messages = useChatStore((state) => state.messages);
  const logs = useBrainStore((state) => state.logs);

  const historyQuery = useQuery({
    queryKey: ["chat", "history"],
    queryFn: () => api.chat.history(50),
  });

  useEffect(() => {
    if (historyQuery.data) {
      useChatStore.getState().setMessages(historyQuery.data);
    }
  }, [historyQuery.data]);

  return (
    <PageWrapper className="grid gap-6 xl:grid-cols-[1.5fr_0.7fr]">
      <div className="space-y-6 xl:col-span-1">
        <ChatWindow messages={messages} isLoading={historyQuery.isLoading} />
        <ChatInput />
      </div>
      <ThoughtStream logs={logs} />
    </PageWrapper>
  );
}
