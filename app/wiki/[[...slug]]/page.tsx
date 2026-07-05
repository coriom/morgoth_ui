"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { WikiHeader } from "@/components/wiki/WikiHeader";
import { WikiNav } from "@/components/wiki/WikiNav";
import { WikiReader } from "@/components/wiki/WikiReader";
import { ApiError, api } from "@/lib/api";

function slugToApiPath(slug: string[] | undefined): string {
  if (!slug || slug.length === 0) return "_index.md";
  return `${slug.join("/")}.md`;
}

function slugToCurrentHref(slug: string[] | undefined): string {
  if (!slug || slug.length === 0) return "/wiki";
  return `/wiki/${slug.join("/")}`;
}

export default function WikiPage() {
  const params = useParams<{ slug?: string[] }>();
  const apiPath = useMemo(() => slugToApiPath(params.slug), [params.slug]);
  const currentHref = useMemo(() => slugToCurrentHref(params.slug), [params.slug]);

  const manifestQuery = useQuery({
    queryKey: ["wiki", "manifest"],
    queryFn: api.wiki.manifest,
    staleTime: 30_000,
  });

  const pageQuery = useQuery({
    queryKey: ["wiki", "page", apiPath],
    queryFn: () => api.wiki.page(apiPath),
    staleTime: 30_000,
    retry: false,
  });

  return (
    <PageWrapper className="space-y-4">
      <WikiHeader compiledAt={manifestQuery.data?.compiled_at ?? null} />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border bg-surface p-4">
          <WikiNav
            manifest={manifestQuery.data}
            currentPath={currentHref}
          />
        </aside>
        <main className="rounded-lg border border-border bg-surface p-6">
          {pageQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-4 animate-pulse rounded bg-surface2/50"
                />
              ))}
            </div>
          ) : pageQuery.isError ? (
            <div className="space-y-3">
              {pageQuery.error instanceof ApiError && pageQuery.error.status === 404 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
                  <div>page not found in vault: {apiPath}</div>
                  <Link
                    href="/wiki"
                    className="mt-2 inline-block text-primary underline decoration-primary/40 hover:decoration-primary"
                  >
                    ← back to /wiki
                  </Link>
                </div>
              ) : (
                <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
                  Failed to load page
                  {pageQuery.error instanceof ApiError
                    ? `: ${pageQuery.error.message}`
                    : "."}
                </div>
              )}
            </div>
          ) : pageQuery.data ? (
            <WikiReader page={pageQuery.data} />
          ) : null}
        </main>
      </div>
    </PageWrapper>
  );
}
