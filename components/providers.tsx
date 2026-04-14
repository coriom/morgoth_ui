"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { useAgents } from "@/hooks/useAgents";
import { useBrainStatus } from "@/hooks/useBrainStatus";
import { useMarketData } from "@/hooks/useMarketData";
import { useWebSocket } from "@/hooks/useWebSocket";

function RealtimeBootstrap() {
  useWebSocket();
  useBrainStatus();
  useAgents();
  useMarketData();

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeBootstrap />
      {children}
    </QueryClientProvider>
  );
}
