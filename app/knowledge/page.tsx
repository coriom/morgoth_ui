"use client";

import { ContradictionsSection } from "@/components/knowledge/ContradictionsSection";
import { ThesesSection } from "@/components/knowledge/ThesesSection";
import { PageWrapper } from "@/components/layout/PageWrapper";

export default function KnowledgePage() {
  return (
    <PageWrapper className="space-y-4">
      <div>
        <h1 className="font-mono text-xs font-semibold uppercase tracking-widest text-textSecondary">
          Knowledge
        </h1>
        <p className="mt-1 text-sm text-textMuted">
          Theses Morgoth has accumulated across completed objectives, and the contradictions
          detected when opposing beliefs are held on the same subject.
        </p>
      </div>
      <ContradictionsSection />
      <ThesesSection />
    </PageWrapper>
  );
}
