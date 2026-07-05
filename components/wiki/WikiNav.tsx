"use client";

import Link from "next/link";
import { useMemo } from "react";

import { cn } from "@/lib/utils/cn";
import type { WikiManifest, WikiPageSummary } from "@/lib/api";

const SECTION_ORDER = ["root", "entities", "system"] as const;

function pageHrefForPath(path: string): string {
  // Strip the trailing .md; the wiki page component reconstructs
  // the API path on fetch. This mirrors the wikilink transform.
  return `/wiki/${path.replace(/\.md$/i, "")}`;
}

export function WikiNav({
  manifest,
  currentPath,
}: {
  manifest?: WikiManifest;
  currentPath: string;
}) {
  const grouped = useMemo(() => {
    const buckets = new Map<string, WikiPageSummary[]>();
    if (manifest) {
      for (const page of manifest.pages) {
        const bucket = buckets.get(page.section) ?? [];
        bucket.push(page);
        buckets.set(page.section, bucket);
      }
    }
    // Deterministic ordering: known sections first, then extras.
    const known = SECTION_ORDER.filter((s) => buckets.has(s));
    const extras = Array.from(buckets.keys())
      .filter((s) => !known.includes(s as (typeof SECTION_ORDER)[number]))
      .sort();
    return [...known, ...extras].map((section) => ({
      section,
      pages: buckets.get(section) ?? [],
    }));
  }, [manifest]);

  if (!manifest) {
    return (
      <nav className="space-y-2 text-sm text-textSecondary">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-surface2/40" />
        ))}
      </nav>
    );
  }

  return (
    <nav className="space-y-4 text-sm">
      {grouped.map(({ section, pages }) => (
        <div key={section} className="space-y-1">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textMuted">
            {section}
          </div>
          <ul className="space-y-0.5">
            {pages.map((page) => {
              const href = pageHrefForPath(page.path);
              const active = href === currentPath;
              return (
                <li key={page.path}>
                  <Link
                    href={href}
                    className={cn(
                      "block truncate rounded px-2 py-1 transition",
                      active
                        ? "bg-primaryGlow text-textPrimary shadow-glow"
                        : "text-textSecondary hover:bg-surface2 hover:text-textPrimary",
                    )}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
