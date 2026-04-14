"use client";

import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PriceData } from "@/types/morgoth";
import { changeToColor } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";
import { formatChange, formatCompactNumber, formatPrice } from "@/lib/utils/format";

type SortKey = "rank" | "symbol" | "price" | "change_24h" | "volume_24h" | "market_cap";

function PriceTableSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="h-12 rounded-lg bg-surface2" />
      ))}
    </div>
  );
}

export function PriceTable({
  prices,
  isLoading,
  isError,
  selectedSymbol,
  onSelect,
}: {
  prices: PriceData[];
  isLoading: boolean;
  isError: boolean;
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("market_cap");
  const [descending, setDescending] = useState(true);

  const sorted = useMemo(() => {
    return [...prices].sort((left, right) => {
      const leftValue = left[sortKey] ?? 0;
      const rightValue = right[sortKey] ?? 0;

      if (typeof leftValue === "string" && typeof rightValue === "string") {
        return descending ? rightValue.localeCompare(leftValue) : leftValue.localeCompare(rightValue);
      }

      return descending ? Number(rightValue) - Number(leftValue) : Number(leftValue) - Number(rightValue);
    });
  }, [descending, prices, sortKey]);

  function handleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setDescending((value) => !value);
      return;
    }

    setSortKey(nextKey);
    setDescending(true);
  }

  if (isLoading) {
    return <PriceTableSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
        Price table could not be loaded.
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
        No prices available.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="cursor-pointer" onClick={() => handleSort("rank")}>
            Rank
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => handleSort("symbol")}>
            Symbol
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => handleSort("price")}>
            Price
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => handleSort("change_24h")}>
            24h
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => handleSort("volume_24h")}>
            Volume
          </TableHead>
          <TableHead className="cursor-pointer" onClick={() => handleSort("market_cap")}>
            Market Cap
          </TableHead>
          <TableHead>Sparkline</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((price, index) => (
          <TableRow
            key={price.symbol}
            onClick={() => onSelect(price.symbol)}
            className={cn("cursor-pointer", selectedSymbol === price.symbol && "bg-primaryGlow")}
          >
            <TableCell className="font-mono text-textSecondary">{price.rank ?? index + 1}</TableCell>
            <TableCell>
              <div className="font-mono text-textPrimary">{price.symbol}</div>
              <div className="text-xs text-textSecondary">{price.name}</div>
            </TableCell>
            <TableCell className={cn("font-mono", changeToColor(price.change_24h))}>{formatPrice(price.price)}</TableCell>
            <TableCell>
              <span className={cn("rounded-full px-2 py-1 font-mono text-xs", price.change_24h >= 0 ? "bg-bullish/20 text-bullish" : "bg-bearish/20 text-bearish")}>
                {formatChange(price.change_24h)}
              </span>
            </TableCell>
            <TableCell className="font-mono">${formatCompactNumber(price.volume_24h)}</TableCell>
            <TableCell className="font-mono">${formatCompactNumber(price.market_cap)}</TableCell>
            <TableCell className="h-12 w-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={(price.sparkline ?? []).map((value, sparkIndex) => ({ value, sparkIndex }))}>
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={price.change_24h >= 0 ? "#10b981" : "#ef4444"}
                    dot={false}
                    strokeWidth={1.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
