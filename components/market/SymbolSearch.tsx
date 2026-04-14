"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PriceData } from "@/types/morgoth";

export function SymbolSearch({
  prices,
  watchlist,
  onAdd,
}: {
  prices: PriceData[];
  watchlist: string[];
  onAdd: (symbol: string) => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    return prices.filter(
      (price) =>
        price.symbol.toLowerCase().includes(normalized) || price.name.toLowerCase().includes(normalized),
    );
  }, [prices, query]);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-3">
        <Search className="h-4 w-4 text-textSecondary" />
        <div>
          <h2 className="text-sm font-semibold text-textPrimary">Symbol Search</h2>
          <p className="text-sm text-textSecondary">Add symbols to the active watchlist.</p>
        </div>
      </div>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search BTC, ETH, Solana..." />
      <div className="mt-4 flex flex-wrap gap-2">
        {watchlist.map((symbol) => (
          <span key={symbol} className="rounded-full bg-primaryGlow px-3 py-1 font-mono text-xs text-textPrimary">
            {symbol}
          </span>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {query.trim() === "" ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-textSecondary">
            Start typing to search symbols.
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-textSecondary">
            No matching symbols found.
          </div>
        ) : (
          results.slice(0, 8).map((result) => (
            <div key={result.symbol} className="flex items-center justify-between rounded-lg border border-border bg-surface2/40 p-3">
              <div>
                <p className="font-mono text-textPrimary">{result.symbol}</p>
                <p className="text-xs text-textSecondary">{result.name}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onAdd(result.symbol)} disabled={watchlist.includes(result.symbol)}>
                {watchlist.includes(result.symbol) ? "Watching" : "Add"}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
