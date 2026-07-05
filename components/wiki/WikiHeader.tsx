"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

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

export function WikiHeader({ compiledAt }: { compiledAt: string | null }) {
  const queryClient = useQueryClient();
  const recompile = useMutation({
    mutationFn: api.wiki.compile,
    onSuccess: () => {
      // Both the manifest and any open page need refreshing after
      // a rebuild — compile rewrites files under VAULT_DIR.
      void queryClient.invalidateQueries({ queryKey: ["wiki", "manifest"] });
      void queryClient.invalidateQueries({ queryKey: ["wiki", "page"] });
    },
  });

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
  );
}
