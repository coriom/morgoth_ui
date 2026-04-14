"use client";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { ModelSelector } from "@/components/admin/ModelSelector";
import { PermissionsEditor } from "@/components/admin/PermissionsEditor";

export default function AdminPage() {
  return (
    <PageWrapper className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-textPrimary">Admin</h1>
        <p className="text-sm text-textSecondary">Manage permission boundaries and model configuration for the runtime.</p>
      </div>
      <PermissionsEditor />
      <ModelSelector />
    </PageWrapper>
  );
}
