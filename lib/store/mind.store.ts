import { create } from "zustand";

import type { KnowledgeDomain, Objective } from "@/types/morgoth";

interface MindStore {
  objectives: Objective[];
  knowledgeDomains: KnowledgeDomain[];
  setObjectives: (objectives: Objective[]) => void;
  updateObjective: (id: string, update: Partial<Objective>) => void;
  setKnowledgeDomains: (domains: KnowledgeDomain[]) => void;
}

export const useMindStore = create<MindStore>((set) => ({
  objectives: [],
  knowledgeDomains: [],
  setObjectives: (objectives) => set({ objectives }),
  updateObjective: (id, update) =>
    set((state) => ({
      objectives: state.objectives.map((objective) =>
        objective.objective_id === id ? { ...objective, ...update } : objective,
      ),
    })),
  setKnowledgeDomains: (knowledgeDomains) => set({ knowledgeDomains }),
}));
