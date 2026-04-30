"use client";

import { useEffect, useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import { ConceptGraph } from "@/components/consciousness/ConceptGraph";
import { LiveThoughtFeed } from "@/components/consciousness/LiveThoughtFeed";
import { ThoughtNebula } from "@/components/consciousness/ThoughtNebula";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { api } from "@/lib/api";
import { useConsciousnessStore } from "@/lib/store/consciousness.store";
import { useBrainStore } from "@/lib/store/brain.store";
import type { ThoughtEntry } from "@/types/morgoth";

function mapLogToThought(logId: string, timestamp: string, content: string, agent: string): ThoughtEntry {
  const topic = content.toLowerCase().match(/[a-zA-Z][a-zA-Z0-9_-]{2,}/g)?.[0] ?? "other";
  return {
    id: logId,
    timestamp,
    content,
    topic,
    agent,
  };
}

export default function ConsciousnessPage() {
  const clusters = useConsciousnessStore((state) => state.clusters);
  const concepts = useConsciousnessStore((state) => state.concepts);
  const liveThoughts = useConsciousnessStore((state) => state.liveThoughts);
  const setClusters = useConsciousnessStore((state) => state.setClusters);
  const setConcepts = useConsciousnessStore((state) => state.setConcepts);
  const logs = useBrainStore((state) => state.logs);

  const clustersQuery = useQuery({
    queryKey: ["consciousness", "clusters"],
    queryFn: api.consciousness.clusters,
    refetchInterval: 15000,
  });

  const conceptsQuery = useQuery({
    queryKey: ["consciousness", "concepts"],
    queryFn: api.consciousness.concepts,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (clustersQuery.data) {
      setClusters(clustersQuery.data);
    }
  }, [clustersQuery.data, setClusters]);

  useEffect(() => {
    if (conceptsQuery.data) {
      setConcepts(conceptsQuery.data);
    }
  }, [conceptsQuery.data, setConcepts]);

  const thoughts = useMemo(() => {
    if (liveThoughts.length > 0) {
      return liveThoughts;
    }

    return logs
      .filter((log) => log.level === "THOUGHT")
      .map((log) => mapLogToThought(log.log_id, log.timestamp, log.content, log.agent));
  }, [liveThoughts, logs]);

  return (
    <PageWrapper className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <ThoughtNebula clusters={clusters} isLoading={clustersQuery.isLoading} />
        <LiveThoughtFeed thoughts={thoughts} isLoading={clustersQuery.isLoading && thoughts.length === 0} />
      </div>
      <ConceptGraph graph={concepts} isLoading={conceptsQuery.isLoading} />
    </PageWrapper>
  );
}
