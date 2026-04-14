"use client";

import { useEffect, useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useMarketStore } from "@/lib/store/market.store";
import type { MarketStats } from "@/types/morgoth";

function buildMarketStats(lastUpdated: string, hasData: boolean): MarketStats {
  return {
    total_market_cap: null,
    btc_dominance: null,
    eth_dominance: null,
    fear_and_greed_index: null,
    last_updated: hasData ? lastUpdated : new Date(0).toISOString(),
  };
}

function getLatestTimestamp(timestamps: string[]): string {
  return timestamps.reduce(
    (latest, current) => (new Date(current).getTime() > new Date(latest).getTime() ? current : latest),
    timestamps[0] ?? new Date().toISOString(),
  );
}

export function useMarketData() {
  const selectedRange = useMarketStore((state) => state.selectedRange);
  const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
  const pricesQuery = useQuery({
    queryKey: ["market", "prices"],
    queryFn: api.market.prices,
    refetchInterval: 30000,
  });

  const historyQuery = useQuery({
    queryKey: ["market", "history", selectedSymbol, selectedRange],
    queryFn: () => api.market.history(selectedSymbol, selectedRange),
    enabled: Boolean(selectedSymbol),
  });

  const pricesData = pricesQuery.data;
  const historyData = historyQuery.data;

  useEffect(() => {
    if (pricesData) {
      useMarketStore.getState().setPrices(pricesData);
      useMarketStore
        .getState()
        .setStats(buildMarketStats(getLatestTimestamp(pricesData.map((price) => price.last_updated)), pricesData.length > 0));
    }
  }, [pricesData]);

  useEffect(() => {
    if (historyData) {
      useMarketStore.getState().setHistory(selectedSymbol, historyData);
    }
  }, [historyData, selectedSymbol]);

  const statsData = useMemo(
    () =>
      pricesData
        ? buildMarketStats(getLatestTimestamp(pricesData.map((price) => price.last_updated)), pricesData.length > 0)
        : undefined,
    [pricesData],
  );

  return {
    pricesQuery,
    statsQuery: {
      ...pricesQuery,
      data: statsData,
    },
    historyQuery,
  };
}
