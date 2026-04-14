"use client";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { MarketStats } from "@/components/market/MarketStats";
import { PriceChart } from "@/components/market/PriceChart";
import { PriceTable } from "@/components/market/PriceTable";
import { SymbolSearch } from "@/components/market/SymbolSearch";
import { useMarketData } from "@/hooks/useMarketData";
import { useMarketStore } from "@/lib/store/market.store";

export default function MarketPage() {
  const { pricesQuery, statsQuery, historyQuery } = useMarketData();
  const prices = useMarketStore((state) => Object.values(state.prices));
  const stats = useMarketStore((state) => state.stats);
  const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
  const selectedRange = useMarketStore((state) => state.selectedRange);
  const history = useMarketStore((state) => state.history[selectedSymbol] ?? []);
  const watchlist = useMarketStore((state) => state.watchlist);
  const setSelectedSymbol = useMarketStore((state) => state.setSelectedSymbol);
  const setSelectedRange = useMarketStore((state) => state.setSelectedRange);
  const addToWatchlist = useMarketStore((state) => state.addToWatchlist);

  return (
    <PageWrapper className="space-y-6">
      <MarketStats stats={stats} isLoading={statsQuery.isLoading} isError={statsQuery.isError} />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-4">
            <h1 className="text-xl font-semibold text-textPrimary">Price Table</h1>
            <p className="text-sm text-textSecondary">Sortable crypto market view with watchlist sparkline context.</p>
          </div>
          <PriceTable
            prices={prices}
            isLoading={pricesQuery.isLoading}
            isError={pricesQuery.isError}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
          />
        </div>
        <PriceChart
          history={history}
          symbol={selectedSymbol}
          range={selectedRange}
          onRangeChange={setSelectedRange}
          isLoading={historyQuery.isLoading}
          isError={historyQuery.isError}
        />
      </div>
      <SymbolSearch prices={prices} watchlist={watchlist} onAdd={addToWatchlist} />
    </PageWrapper>
  );
}
