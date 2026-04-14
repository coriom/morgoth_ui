import { Card, CardContent } from "@/components/ui/card";
import type { MarketStats as MarketStatsType } from "@/types/morgoth";
import { formatCompactNumber, formatTimestamp } from "@/lib/utils/format";

export function MarketStats({
  stats,
  isLoading,
  isError,
}: {
  stats: MarketStatsType | null;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="animate-pulse grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-1/2 rounded bg-surface2" />
              <div className="h-5 w-2/3 rounded bg-surface2" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError || !stats) {
    return (
      <Card>
        <CardContent>
          <div className="rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
            Market statistics could not be loaded.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid gap-4 md:grid-cols-5">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Total Market Cap</p>
          <p className="mt-2 font-mono text-lg text-textPrimary">
            {stats.total_market_cap !== null ? `$${formatCompactNumber(stats.total_market_cap)}` : "Unavailable"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-textMuted">BTC Dominance</p>
          <p className="mt-2 font-mono text-lg text-textPrimary">
            {stats.btc_dominance !== null ? `${stats.btc_dominance.toFixed(2)}%` : "Unavailable"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-textMuted">ETH Dominance</p>
          <p className="mt-2 font-mono text-lg text-textPrimary">
            {stats.eth_dominance !== null ? `${stats.eth_dominance.toFixed(2)}%` : "Unavailable"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Fear & Greed</p>
          <p className="mt-2 font-mono text-lg text-textPrimary">{stats.fear_and_greed_index ?? "Unavailable"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-textMuted">Last Updated</p>
          <p className="mt-2 font-mono text-lg text-textPrimary">{formatTimestamp(stats.last_updated)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
