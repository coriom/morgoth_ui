"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MarketRange, PricePoint } from "@/types/morgoth";
import { formatPrice, formatTimestamp } from "@/lib/utils/format";

const RANGES: MarketRange[] = ["1D", "7D", "30D", "90D"];

function ChartTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0 || typeof label !== "string") {
    return null;
  }

  const priceValue = payload.find((item) => item.dataKey === "price")?.value;
  const volumeValue = payload.find((item) => item.dataKey === "volume")?.value;

  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm shadow-xl">
      <p className="mb-2 font-mono text-xs text-textMuted">{formatTimestamp(label)}</p>
      <p className="font-mono text-textPrimary">
        Price: {typeof priceValue === "number" ? formatPrice(priceValue) : "—"}
      </p>
      <p className="font-mono text-textSecondary">
        Volume: {typeof volumeValue === "number" ? volumeValue.toLocaleString("en-US") : "—"}
      </p>
    </div>
  );
}

export function PriceChart({
  history,
  symbol,
  range,
  onRangeChange,
  isLoading,
  isError,
}: {
  history: PricePoint[];
  symbol: string;
  range: MarketRange;
  onRangeChange: (range: MarketRange) => void;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Price Chart</CardTitle>
          <p className="mt-1 text-sm text-textSecondary">{symbol} price and volume history by selected range.</p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((item) => (
            <Button key={item} size="sm" variant={item === range ? "default" : "secondary"} onClick={() => onRangeChange(item)}>
              {item}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-[380px]">
        {isLoading ? <div className="h-full animate-pulse rounded-lg bg-surface2" /> : null}
        {!isLoading && isError ? (
          <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
            Price history could not be loaded.
          </div>
        ) : null}
        {!isLoading && !isError && history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-textSecondary">
            Select a symbol to load chart history.
          </div>
        ) : null}
        {!isLoading && !isError && history.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} stroke="#475569" fontSize={12} />
              <YAxis yAxisId="price" stroke="#94a3b8" fontSize={12} tickFormatter={(value: number) => `$${value}`} />
              <YAxis yAxisId="volume" orientation="right" stroke="#475569" fontSize={12} tickFormatter={(value: number) => `${Math.round(value / 1000000)}M`} />
              <Tooltip content={<ChartTooltip />} />
              <Area yAxisId="price" type="monotone" dataKey="price" stroke="#7c3aed" fill="url(#priceFill)" strokeWidth={2} />
              <Line yAxisId="volume" type="monotone" dataKey="volume" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        ) : null}
      </CardContent>
    </Card>
  );
}
