"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { List, Network, RefreshCw } from "lucide-react";
import Link from "next/link";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils/cn";

function formatCompiledAt(iso: string | null): string {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

interface WikiHeaderProps {
  compiledAt: string | null;
  view?: "list" | "graph";
}

export function WikiHeader({ compiledAt, view = "list" }: WikiHeaderProps) {
  const queryClient = useQueryClient();
  const recompile = useMutation({
    mutationFn: api.wiki.compile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wiki", "manifest"] });
      void queryClient.invalidateQueries({ queryKey: ["wiki", "page"] });
      void queryClient.invalidateQueries({ queryKey: ["wiki", "graph"] });
    },
  });

  const graphMode = view === "graph";
  const toggleHref = graphMode ? "/wiki" : "/wiki/graph";
  const ToggleIcon = graphMode ? List : Network;
  const toggleLabel = graphMode ? "List" : "Graph";

  return (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <div>
        <h1 className="font-mono text-xs font-semibold uppercase tracking-widest text-textSecondary">
          Wiki
        </h1>
        <p className="mt-1 text-sm text-textMuted">
          Vault compiled at{" "}
          <span className="font-mono text-textSecondary">
            {formatCompiledAt(compiledAt)}
          </span>
          {recompile.isError ? (
            <span className="ml-2 text-error">— last recompile failed</span>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={toggleHref}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-1.5 text-sm text-textPrimary transition hover:border-primary hover:text-primary"
        >
          <ToggleIcon className="h-3.5 w-3.5" />
          {toggleLabel}
        </Link>
        <button
          type="button"
          onClick={() => recompile.mutate()}
          disabled={recompile.isPending}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-1.5 text-sm text-textPrimary transition",
            recompile.isPending
              ? "cursor-wait opacity-60"
              : "hover:border-primary hover:text-primary",
          )}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", recompile.isPending && "animate-spin")}
          />
          {recompile.isPending ? "Recompiling…" : "Recompile"}
        </button>
      </div>
    </div>
  );
}
