import { create } from "zustand";

import type { BrainStatus, ConnectionStatus, LogEntry, SelfModification, Task } from "@/types/morgoth";

interface BrainStore {
  status: BrainStatus | null;
  logs: LogEntry[];
  tasks: Task[];
  selfModifications: SelfModification[];
  connected: boolean;
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;
  setStatus: (status: BrainStatus) => void;
  setLogs: (entries: LogEntry[]) => void;
  addLog: (entry: LogEntry) => void;
  setTasks: (tasks: Task[]) => void;
  setSelfModifications: (items: SelfModification[]) => void;
  setConnected: (connected: boolean) => void;
  setConnectionState: (status: ConnectionStatus, attempt: number) => void;
}

export const useBrainStore = create<BrainStore>((set) => ({
  status: null,
  logs: [],
  tasks: [],
  selfModifications: [],
  connected: false,
  connectionStatus: "DISCONNECTED",
  reconnectAttempt: 0,
  setStatus: (status) => set({ status }),
  setLogs: (logs) => set({ logs }),
  addLog: (entry) =>
    set((state) => ({
      logs: [entry, ...state.logs].slice(0, 500),
    })),
  setTasks: (tasks) => set({ tasks }),
  setSelfModifications: (selfModifications) => set({ selfModifications }),
  setConnected: (connected) => set({ connected }),
  setConnectionState: (connectionStatus, reconnectAttempt) =>
    set({
      connectionStatus,
      reconnectAttempt,
      connected: connectionStatus === "CONNECTED",
    }),
}));
