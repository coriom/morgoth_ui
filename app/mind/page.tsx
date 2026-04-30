"use client";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { KnowledgeMap } from "@/components/mind/KnowledgeMap";
import { LearningFeed } from "@/components/mind/LearningFeed";
import { ObjectivesList } from "@/components/mind/ObjectivesList";
import { useObjectives } from "@/hooks/useObjectives";
import { useBrainStore } from "@/lib/store/brain.store";
import { useMindStore } from "@/lib/store/mind.store";
import type { ObjectiveStatus } from "@/types/morgoth";

export default function MindPage() {
  const { objectivesQuery, updateObjectiveMutation } = useObjectives();
  const objectives = useMindStore((state) => state.objectives);
  const knowledgeDomains = useMindStore((state) => state.knowledgeDomains);
  const logs = useBrainStore((state) => state.logs);

  function handleStatusChange(id: string, status: ObjectiveStatus) {
    updateObjectiveMutation.mutate({ id, status });
  }

  return (
    <PageWrapper className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
      <KnowledgeMap domains={knowledgeDomains} isLoading={false} />
      <div className="space-y-6">
        <ObjectivesList
          objectives={objectives}
          isLoading={objectivesQuery.isLoading}
          pendingId={updateObjectiveMutation.variables?.id ?? null}
          onStatusChange={handleStatusChange}
        />
        <LearningFeed logs={logs} />
      </div>
    </PageWrapper>
  );
}
