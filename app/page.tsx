"use client";

import { CycleFeed } from "@/components/dashboard/CycleFeed";
import { ObjectivesPanel } from "@/components/dashboard/ObjectivesPanel";
import { StatusBar } from "@/components/dashboard/StatusBar";

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      <div className="grid min-h-0 flex-1 gap-3 p-3 [grid-template-columns:2fr_3fr]">
        <CycleFeed />
        <ObjectivesPanel />
      </div>
    </div>
  );
}
