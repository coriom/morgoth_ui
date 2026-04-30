import { create } from "zustand";

import type { ConceptGraph, ThoughtCluster, ThoughtEntry } from "@/types/morgoth";

interface ConsciousnessStore {
  clusters: ThoughtCluster[];
  concepts: ConceptGraph;
  liveThoughts: ThoughtEntry[];
  selectedTopic: string | null;
  setClusters: (clusters: ThoughtCluster[]) => void;
  setConcepts: (concepts: ConceptGraph) => void;
  addThought: (thought: ThoughtEntry) => void;
  setSelectedTopic: (topic: string | null) => void;
}

const EMPTY_GRAPH: ConceptGraph = {
  nodes: [],
  edges: [],
};

export const useConsciousnessStore = create<ConsciousnessStore>((set) => ({
  clusters: [],
  concepts: EMPTY_GRAPH,
  liveThoughts: [],
  selectedTopic: null,
  setClusters: (clusters) => set({ clusters }),
  setConcepts: (concepts) => set({ concepts }),
  addThought: (thought) =>
    set((state) => ({
      liveThoughts: [thought, ...state.liveThoughts].slice(0, 200),
    })),
  setSelectedTopic: (selectedTopic) => set({ selectedTopic }),
}));
