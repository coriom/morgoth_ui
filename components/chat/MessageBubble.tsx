"use client";

import ReactMarkdown from "react-markdown";

import type { ChatMessage } from "@/types/morgoth";
import { formatTimestamp } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("group flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg border border-border px-4 py-3 text-sm leading-7 text-textPrimary",
          isUser ? "bg-surface2" : "border-l-[3px] border-l-primary bg-surface",
        )}
      >
        <div className="prose prose-invert max-w-none prose-pre:m-0 prose-code:font-mono prose-p:text-textPrimary prose-strong:text-textPrimary">
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className ?? "");
                if (match) {
                  return (
                    <pre className="overflow-x-auto rounded-lg border border-border bg-surface2 p-4">
                      <code className="font-mono text-xs text-textPrimary">{String(children).replace(/\n$/, "")}</code>
                    </pre>
                  );
                }

                return (
                  <code className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-xs text-textPrimary" {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        <div className="mt-2 opacity-0 transition group-hover:opacity-100">
          <span className="font-mono text-[11px] text-textMuted">{formatTimestamp(message.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
