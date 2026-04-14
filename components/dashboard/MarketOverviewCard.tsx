import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PriceData } from "@/types/morgoth";
import { changeToColor } from "@/lib/utils/colors";
import { formatChange, formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

function MarketOverviewSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center justify-between rounded-lg border border-border bg-surface2/40 p-3">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-surface2" />
            <div className="h-3 w-12 rounded bg-surface2" />
          </div>
          <div className="space-y-2 text-right">
            <div className="h-3 w-24 rounded bg-surface2" />
            <div className="h-3 w-14 rounded bg-surface2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketOverviewCard({
  prices,
  isLoading,
  isError,
}: {
  prices: PriceData[];
  isLoading: boolean;
  isError: boolean;
}) {
  const items = [...prices].slice(0, 5);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Market Overview</CardTitle>
        <p className="text-sm text-textSecondary">Top watchlist moves streaming into the dashboard.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? <MarketOverviewSkeleton /> : null}
        {!isLoading && isError ? (
          <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
            Market prices are unavailable.
          </div>
        ) : null}
        {!isLoading && !isError && items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-textSecondary">
            No market symbols are streaming yet.
          </div>
        ) : null}
        {!isLoading && !isError && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((price) => (
              <div
                key={price.symbol}
                className="flex items-center justify-between rounded-lg border border-border bg-surface2/40 p-3"
              >
                <div>
                  <p className="font-mono text-base text-textPrimary">{price.symbol}</p>
                  <p className="text-xs text-textSecondary">{price.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-textPrimary">{formatPrice(price.price)}</p>
                  <p className={cn("font-mono text-xs", changeToColor(price.change_24h))}>
                    {formatChange(price.change_24h)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
