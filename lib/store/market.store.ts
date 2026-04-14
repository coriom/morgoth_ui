import { create } from "zustand";

import type { MarketRange, MarketStats, PriceData, PricePoint } from "@/types/morgoth";

interface MarketStore {
  prices: Record<string, PriceData>;
  selectedSymbol: string;
  selectedRange: MarketRange;
  history: Record<string, PricePoint[]>;
  stats: MarketStats | null;
  watchlist: string[];
  setPrices: (prices: PriceData[]) => void;
  setPrice: (symbol: string, data: PriceData) => void;
  setHistory: (symbol: string, data: PricePoint[]) => void;
  setSelectedSymbol: (symbol: string) => void;
  setSelectedRange: (range: MarketRange) => void;
  setStats: (stats: MarketStats) => void;
  addToWatchlist: (symbol: string) => void;
}

export const useMarketStore = create<MarketStore>((set) => ({
  prices: {},
  selectedSymbol: "BTC",
  selectedRange: "7D",
  history: {},
  stats: null,
  watchlist: ["BTC", "ETH"],
  setPrices: (prices) =>
    set({
      prices: prices.reduce<Record<string, PriceData>>((accumulator, price) => {
        accumulator[price.symbol] = price;
        return accumulator;
      }, {}),
    }),
  setPrice: (symbol, data) =>
    set((state) => ({
      prices: {
        ...state.prices,
        [symbol]: data,
      },
    })),
  setHistory: (symbol, data) =>
    set((state) => ({
      history: {
        ...state.history,
        [symbol]: data,
      },
    })),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  setSelectedRange: (selectedRange) => set({ selectedRange }),
  setStats: (stats) => set({ stats }),
  addToWatchlist: (symbol) =>
    set((state) => ({
      watchlist: state.watchlist.includes(symbol) ? state.watchlist : [...state.watchlist, symbol],
    })),
}));
