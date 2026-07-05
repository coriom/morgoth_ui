"use client";

import Link from "next/link";
import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { transformWikilinks } from "@/lib/wikilinks";
import type { WikiPage } from "@/lib/api";

/**
 * Wiki content renderer.
 *
 * SECURITY LOCK: this component MUST NOT be given rehype-raw or any
 * plugin that reactivates raw HTML in the markdown pipeline, and it
 * MUST NOT dangerouslySetInnerHTML any part of the vault content.
 * The vault prose is derived from open-web content (thesis subjects
 * ← news feeds); admitting raw HTML would open an XSS channel that
 * only the compile step's LLM stands between us and. React-markdown's
 * default sanitization (escape HTML into text) is the intended
 * behavior — do not weaken it.
 */

function isExternalHref(href: string | undefined): boolean {
  if (!href) return false;
  return /^https?:\/\//i.test(href) || href.startsWith("//");
}

export function WikiReader({ page }: { page: WikiPage }) {
  const transformed = useMemo(() => transformWikilinks(page.content), [page.content]);

  const components: Components = {
    // Internal links via next/link so navigation stays client-side;
    // external links open in a new tab with noopener.
    a: ({ href, children, ...props }) => {
      if (!href) {
        return <span {...props}>{children}</span>;
      }
      if (isExternalHref(href)) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/40 hover:decoration-primary"
            {...props}
          >
            {children}
          </a>
        );
      }
      return (
        <Link
          href={href}
          className="text-primary underline decoration-primary/40 hover:decoration-primary"
        >
          {children}
        </Link>
      );
    },
    h1: ({ children }) => (
      <h1 className="mt-2 mb-4 border-b border-border pb-2 font-sans text-2xl font-semibold text-textPrimary">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-6 mb-3 font-sans text-lg font-semibold text-textPrimary">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-4 mb-2 font-sans text-base font-semibold text-textPrimary">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="my-2 leading-relaxed text-textSecondary">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="my-2 list-disc space-y-1 pl-6 text-textSecondary">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 list-decimal space-y-1 pl-6 text-textSecondary">{children}</ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    code: ({ className, children }) => {
      const inline = !className;
      if (inline) {
        return (
          <code className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-xs text-textPrimary">
            {children}
          </code>
        );
      }
      return (
        <code className={`${className ?? ""} font-mono text-xs`}>{children}</code>
      );
    },
    pre: ({ children }) => (
      <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-surface2 p-3 font-mono text-xs text-textPrimary">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-2 border-border pl-3 text-textMuted">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-6 border-border" />,
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse border border-border text-sm">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-surface2">{children}</thead>,
    tr: ({ children }) => (
      <tr className="border-b border-border last:border-b-0">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="border-r border-border px-3 py-2 text-left font-semibold text-textPrimary last:border-r-0">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-r border-border px-3 py-2 align-top text-textSecondary last:border-r-0">
        {children}
      </td>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-textPrimary">{children}</strong>
    ),
    em: ({ children }) => <em className="italic text-textPrimary">{children}</em>,
  };

  return (
    <article className="prose-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {transformed}
      </ReactMarkdown>
    </article>
  );
}
