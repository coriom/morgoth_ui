"use client";

/**
 * COCKPIT — the one-glance home. Slice 1 of the redesign.
 *
 * Layout: Pulse (left ~40%) | Chat (right ~60%) | DecisionsStrip (bottom).
 * DecisionsStrip collapses to nothing when there are no pending
 * proposals so an idle Morgoth stays visually quiet.
 *
 * READ-ONLY: no mutations, no crank, no approve/reject buttons. The
 * PendingBadge in the shared TopBar is the anti-"frozen verdict"
 * signal from every page; slice 2 wires the backend and lights it up.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { ChatInput } from "@/components/chat/ChatInput";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { DecisionsStrip } from "@/components/cockpit/DecisionsStrip";
import { Pulse } from "@/components/cockpit/Pulse";
import { api } from "@/lib/api";
import { useChatStore } from "@/lib/store/chat.store";

export default function CockpitPage() {
  const messages = useChatStore((state) => state.messages);
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 gap-3 p-3 [grid-template-columns:2fr_3fr]">
        <Pulse />
        <div className="flex min-h-0 flex-col gap-3">
          <ChatWindow
            messages={messages}
            isLoading={historyQuery.isLoading}
            className="flex min-h-0 flex-1 flex-col"
          />
          <ChatInput />
        </div>
      </div>
      <DecisionsStrip />
    </div>
  );
}
