import { create } from "zustand";

import type { ChatMessage } from "@/types/morgoth";

interface ChatStore {
  messages: ChatMessage[];
  isThinking: boolean;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setThinking: (value: boolean) => void;
  clearHistory: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isThinking: false,
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  setMessages: (messages) => set({ messages }),
  setThinking: (isThinking) => set({ isThinking }),
  clearHistory: () => set({ messages: [] }),
}));
