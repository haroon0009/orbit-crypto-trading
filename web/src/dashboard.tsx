import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Position {
  direction: string;
  quantity: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  opened_at: string;
}

interface Trade {
  direction: string;
  entry_price: number;
  exit_price: number;
  net_pnl: number;
  exit_reason: string;
  closed_at: string;
}

export interface DashboardData {
  generatedAt: string;
  mode: string;
  symbol: string;
  interval: number;
  market: {
    candles: Candle[];
    lastPrice: number | null;
    changePercent: number | null;
    fresh: boolean;
    lastCandleAt: string | null;
  };
  paper: null | {
    balance: number;
    equity: number;
    dailyPnl: number;
    dryRun: boolean;
    lastCandleAt: string | null;
    position: Position | null;
    trades: Trade[];
    orders: Array<{
      side: string;
      order_type: string;
      status: string;
      quantity: number | null;
      created_at: string;
    }>;
    summary: {
      totalTrades: number;
      winningTrades: number;
      netPnl: number;
    };
  };
  testnet: null | {
    ready: boolean;
    last_reconciled_at: string | null;
    updated_at: string;
  };
  risk: Array<{
    occurred_at: string;
    accepted: boolean;
    reason_code: string;
  }>;
  strategies: Array<{
    strategy_id: string;
    strategy_version: string;
    symbol: string;
    interval_minutes: number;
    source: string;
    configuration: Record<string, unknown>;
    last_used_at: string;
  }>;
  strategyVersions: Array<{
    strategy_id: string;
    version: string;
    display_name: string;
    configuration: Record<string, unknown>;
    created_at: string;
    active: boolean;
    bot_count: number;
    active_bot_count: number;
  }>;
  bots: Array<{
    id: string;
    name: string;
    exchange: string;
    symbol: string;
    interval_minutes: number;
    strategy_id: string;
    strategy_version: string;
    total_capital: number;
    min_trade_amount: number;
    max_trade_amount: number;
    leverage: number;
    stop_loss_percent: number;
    take_profit_percent: number;
    active: boolean;
    total_trades: number;
    net_pnl: number;
    updated_at: string;
  }>;
  backtests: Array<{
    id: string;
    strategy_id: string;
    strategy_version: string;
    symbol: string;
    interval_minutes: number;
    start_time: string;
    end_time: string;
    candle_count: number;
    metrics: {
      totalTrades?: number;
      winRatePercent?: string;
      netProfit?: string;
      maxDrawdownPercent?: string;
      returnPercent?: string;
      finalBalance?: string;
    };
    created_at: string;
  }>;
  liveAnalytics: {
    summary: {
      totalTrades: number;
      winningTrades: number;
      netPnl: number;
      fees: number;
    };
    trades: Array<{
      id: string;
      strategy_id: string;
      strategy_version: string;
      symbol: string;
      interval_minutes: number;
      direction: string;
      quantity: number;
      entry_price: number;
      exit_price: number;
      fees: number;
      net_pnl: number;
      exit_reason: string;
      opened_at: string;
      closed_at: string;
    }>;
    executionStates: Array<{ state: string; count: number }>;
  };
  exchanges: Array<{
    id: string;
    name: string;
    connected: boolean;
    active: boolean;
    marketData: boolean;
    environment: string;
  }>;
  historicalDatasets: Array<{
    symbol: string;
    interval_minutes: number;
    candle_count: number;
    start_time: string;
    end_time: string;
  }>;
}

interface DashboardContextValue {
  data: DashboardData | null;
  error: string | null;
  loading: boolean;
  liveConnected: boolean;
  symbol: string;
  interval: number;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: number) => void;
  refresh: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState(15);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ symbol, interval: String(interval) });
      const response = await fetch(`/api/dashboard?${query}`);
      const body = (await response.json()) as DashboardData & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "Dashboard request failed");
      setData(body);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Dashboard request failed",
      );
    } finally {
      setLoading(false);
    }
  }, [interval, symbol]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (interval === 1440) {
      setLiveConnected(false);
      return;
    }
    const query = new URLSearchParams({ symbol, interval: String(interval) });
    const source = new EventSource(`/api/market-stream?${query}`);
    source.onopen = () => setLiveConnected(true);
    source.onerror = () => setLiveConnected(false);
    source.addEventListener("snapshot", (event) => {
      const snapshot = JSON.parse(event.data) as { candles: Candle[] };
      const last = snapshot.candles.at(-1);
      const first = snapshot.candles[0];
      setData((current) =>
        !current || current.symbol !== symbol
          ? current
          : {
              ...current,
              market: {
                candles: snapshot.candles,
                lastPrice: last?.close ?? null,
                changePercent:
                  first && last
                    ? ((last.close - first.open) / first.open) * 100
                    : null,
                lastCandleAt: last
                  ? new Date(last.time * 1000).toISOString()
                  : null,
                fresh: true,
              },
            },
      );
    });
    source.onmessage = (event) => {
      const update = JSON.parse(event.data) as {
        candle: Candle;
        finalized: boolean;
      };
      setData((current) => {
        if (!current || current.symbol !== symbol) return current;
        const candles = current.market.candles
          .filter((candle) => candle.time !== update.candle.time)
          .concat(update.candle)
          .sort((a, b) => a.time - b.time)
          .slice(-500);
        return {
          ...current,
          market: {
            ...current.market,
            candles,
            lastPrice: update.candle.close,
            lastCandleAt: new Date(update.candle.time * 1000).toISOString(),
            fresh: true,
          },
        };
      });
    };
    return () => source.close();
  }, [interval, symbol]);

  const value = useMemo(
    () => ({
      data,
      error,
      loading,
      liveConnected,
      symbol,
      interval,
      setSymbol,
      setInterval,
      refresh,
    }),
    [data, error, interval, liveConnected, loading, refresh, symbol],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context)
    throw new Error("useDashboard must be used inside DashboardProvider");
  return context;
}

export function timeAgo(value: string | null | undefined) {
  if (!value) return "Never";
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
