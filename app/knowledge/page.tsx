"use client";

import { ContradictionsSection } from "@/components/knowledge/ContradictionsSection";
import { SubjectGroupedTheses } from "@/components/knowledge/SubjectGroupedTheses";
import { PageWrapper } from "@/components/layout/PageWrapper";

export default function KnowledgePage() {
  return (
    <PageWrapper className="space-y-4">
      <div>
        <h1 className="font-mono text-xs font-semibold uppercase tracking-widest text-textSecondary">
          Knowledge
        </h1>
        <p className="mt-1 text-sm text-textMuted">
          Theses Morgoth has accumulated across completed objectives, grouped by
          subject with status + freshness filters. Contradictions surface both as
          a section below and as ⚠ markers on the subjects where they landed.
        </p>
      </div>
      <ContradictionsSection />
      <SubjectGroupedTheses />
    </PageWrapper>
  );
}
