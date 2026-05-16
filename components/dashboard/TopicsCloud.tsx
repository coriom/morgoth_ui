"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import type { LogEntry } from "@/types/morgoth";

const STOPWORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","is","was",
  "are","were","be","been","being","have","has","had","do","does","did","will","would",
  "could","should","may","might","shall","can","not","no","nor","so","yet","both","either",
  "neither","each","few","more","most","other","some","such","than","too","very","just",
  "that","this","it","its","he","she","they","we","you","i","me","him","her","them","us",
  "from","by","as","into","through","during","before","after","above","below","up","down",
  "out","off","over","under","then","once","here","there","when","where","why","how","all",
  "any","both","each","few","more","most","other","same","than","then","there","these",
  "those","about","against","between","own","same","s","t","re","m","ll","ve","d",
  "morgoth","agent","log","task","tool","result","error","step","cycle","run","call",
]);

interface WordFreq {
  word: string;
  count: number;
}

function extractWords(logs: LogEntry[]): WordFreq[] {
  const freq: Record<string, number> = {};
  for (const log of logs) {
    const words = log.content
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w));
    for (const word of words) {
      freq[word] = (freq[word] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);
}

function fontSizeClass(count: number, max: number): string {
  const ratio = count / max;
  if (ratio > 0.8) return "text-2xl font-bold";
  if (ratio > 0.6) return "text-xl font-semibold";
  if (ratio > 0.4) return "text-base font-semibold";
  if (ratio > 0.2) return "text-sm font-medium";
  return "text-xs";
}

function colorClass(index: number): string {
  const colors = [
    "text-cyan-400",
    "text-emerald-400",
    "text-amber-400",
    "text-violet-400",
    "text-rose-400",
    "text-sky-400",
  ];
  return colors[index % colors.length];
}

export function TopicsCloud({ logs, isLoading }: { logs: LogEntry[]; isLoading: boolean }) {
  const words = useMemo(() => extractWords(logs.filter((l) => l.level === "THOUGHT")), [logs]);
  const maxCount = words[0]?.count ?? 1;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-zinc-400">
        Recent Topics
      </h2>

      {isLoading ? (
        <div className="flex flex-wrap gap-2 animate-pulse">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="rounded bg-zinc-800"
              style={{ width: `${40 + Math.random() * 60}px`, height: "16px" }}
            />
          ))}
        </div>
      ) : words.length === 0 ? (
        <p className="font-mono text-xs text-zinc-600">No thought logs yet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 leading-tight">
          {words.map((item, i) => (
            <span
              key={item.word}
              title={`${item.count} occurrences`}
              className={cn(
                "cursor-default transition-opacity hover:opacity-80 font-mono",
                fontSizeClass(item.count, maxCount),
                colorClass(i)
              )}
              style={{ opacity: 0.4 + 0.6 * (item.count / maxCount) }}
            >
              {item.word}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
