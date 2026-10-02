import type pg from "pg";

const allowedIntervals = new Set([1, 3, 5, 15, 30, 60, 240, 1440]);

export function parseDashboardQuery(url: URL) {
  const symbol = (url.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const interval = Number(url.searchParams.get("interval") ?? "15");

  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) throw new Error("Invalid symbol");
  if (!allowedIntervals.has(interval)) throw new Error("Unsupported interval");
  return { symbol, interval };
}

export async function loadDashboard(
  pool: pg.Pool,
  symbol: string,
  interval: number,
  mode: string,
) {
  const [
    paperResult,
    executionResult,
    riskResult,
    backtestResult,
    strategyVersionsResult,
    botsResult,
    backtestsResult,
    liveStatsResult,
    liveTradesResult,
    executionStatsResult,
    historicalResult,
  ] = await Promise.all([
    pool.query<{
      id: string;
      balance: string;
      equity: string;
      daily_realized_pnl: string;
      dry_run: boolean;
      last_candle_time: Date | null;
      updated_at: Date;
    }>(
      `SELECT id, balance::text, equity::text, daily_realized_pnl::text,
                dry_run, last_candle_time, updated_at
         FROM paper_accounts
         WHERE symbol = $1 AND interval_minutes = $2
         ORDER BY updated_at DESC LIMIT 1`,
      [symbol, interval],
    ),
    pool.query<{
      ready: boolean;
      last_reconciled_at: Date | null;
      reconciled_snapshot: unknown;
      updated_at: Date;
    }>(
      `SELECT ready, last_reconciled_at, reconciled_snapshot, updated_at
         FROM execution_accounts
         WHERE symbol = $1
         ORDER BY updated_at DESC LIMIT 1`,
      [symbol],
    ),
    pool.query<{
      occurred_at: Date;
      accepted: boolean;
      reason_code: string;
    }>(
      `SELECT occurred_at, accepted, reason_code
         FROM risk_decisions
         ORDER BY occurred_at DESC LIMIT 8`,
    ),
    pool.query<{ created_at: Date; metrics: unknown }>(
      `SELECT created_at, metrics
         FROM backtest_runs
         WHERE symbol = $1 AND interval_minutes = $2
         ORDER BY created_at DESC LIMIT 1`,
      [symbol, interval],
    ),
    pool.query<{
      strategy_id: string;
      version: string;
      display_name: string;
      configuration: Record<string, unknown>;
      active: boolean;
      bot_count: string;
      active_bot_count: string;
      created_at: Date;
    }>(
      `SELECT s.strategy_id, s.version, s.display_name, s.configuration,
              s.active, s.created_at, count(b.id)::text AS bot_count,
              count(b.id) FILTER (WHERE b.active)::text AS active_bot_count
       FROM strategy_versions s
       LEFT JOIN bot_assignments b
         ON b.strategy_id = s.strategy_id AND b.strategy_version = s.version
       GROUP BY s.strategy_id, s.version
       ORDER BY s.strategy_id, s.created_at DESC`,
    ),
    pool.query<{
      id: string;
      name: string;
      exchange: string;
      symbol: string;
      interval_minutes: number;
      strategy_id: string;
      strategy_version: string;
      total_capital: string;
      min_trade_amount: string;
      max_trade_amount: string;
      leverage: string;
      stop_loss_percent: string;
      take_profit_percent: string;
      active: boolean;
      total_trades: string;
      net_pnl: string;
      updated_at: Date;
    }>(
      `SELECT b.id, b.name, b.exchange, b.symbol, b.interval_minutes,
              b.strategy_id, b.strategy_version, b.total_capital::text,
              b.min_trade_amount::text, b.max_trade_amount::text,
              b.leverage::text, b.stop_loss_percent::text,
              b.take_profit_percent::text, b.active, b.updated_at,
              stats.total_trades, stats.net_pnl
       FROM bot_assignments b
       LEFT JOIN LATERAL (
         SELECT count(t.id)::text AS total_trades,
                coalesce(sum(t.net_pnl), 0)::text AS net_pnl
         FROM paper_accounts a
         LEFT JOIN paper_trades t ON t.account_id = a.id
         WHERE a.strategy_id = b.strategy_id
           AND a.strategy_version = b.strategy_version
           AND a.symbol = b.symbol
           AND a.interval_minutes = b.interval_minutes
       ) stats ON true
       ORDER BY b.active DESC, b.updated_at DESC`,
    ),
    pool.query<{
      id: string;
      strategy_id: string;
      strategy_version: string;
      symbol: string;
      interval_minutes: number;
      start_time: Date;
      end_time: Date;
      candle_count: number;
      metrics: Record<string, unknown>;
      created_at: Date;
    }>(
      `SELECT id, strategy_id, strategy_version, symbol, interval_minutes,
              start_time, end_time, candle_count, metrics, created_at
       FROM backtest_runs
       ORDER BY created_at DESC
       LIMIT 50`,
    ),
    pool.query<{
      total_trades: string;
      winning_trades: string;
      net_pnl: string;
      fees: string;
    }>(
      `SELECT count(*)::text AS total_trades,
              count(*) FILTER (WHERE net_pnl > 0)::text AS winning_trades,
              coalesce(sum(net_pnl), 0)::text AS net_pnl,
              coalesce(sum(fees), 0)::text AS fees
       FROM paper_trades`,
    ),
    pool.query<{
      id: string;
      strategy_id: string;
      strategy_version: string;
      symbol: string;
      interval_minutes: number;
      direction: string;
      quantity: string;
      entry_price: string;
      exit_price: string;
      fees: string;
      net_pnl: string;
      exit_reason: string;
      opened_at: Date;
      closed_at: Date;
    }>(
      `SELECT t.id, a.strategy_id, a.strategy_version, a.symbol,
              a.interval_minutes, t.direction, t.quantity::text,
              t.entry_price::text, t.exit_price::text, t.fees::text,
              t.net_pnl::text, t.exit_reason, t.opened_at, t.closed_at
       FROM paper_trades t
       JOIN paper_accounts a ON a.id = t.account_id
       ORDER BY t.closed_at DESC LIMIT 100`,
    ),
    pool.query<{ state: string; count: string }>(
      `SELECT state, count(*)::text AS count
       FROM execution_intents GROUP BY state ORDER BY state`,
    ),
    pool.query<{
      symbol: string;
      interval_minutes: number;
      candle_count: string;
      start_time: Date;
      end_time: Date;
    }>(
      `SELECT i.symbol, c.interval_minutes, count(*)::text AS candle_count,
              min(c.open_time) AS start_time, max(c.open_time) AS end_time
       FROM candles c
       JOIN instruments i ON i.id = c.instrument_id
       WHERE i.exchange = 'BYBIT' AND i.market_type = 'LINEAR'
       GROUP BY i.symbol, c.interval_minutes
       ORDER BY i.symbol, c.interval_minutes`,
    ),
  ]);

  const paper = paperResult.rows[0];
  const [positionResult, tradesResult, ordersResult, paperStatsResult] = paper
    ? await Promise.all([
        pool.query<{
          direction: string;
          quantity: string;
          entry_price: string;
          stop_loss: string;
          take_profit: string;
          opened_at: Date;
        }>(
          `SELECT p.direction, p.quantity::text, f.price::text AS entry_price,
                  p.stop_loss::text, p.take_profit::text, p.opened_at
           FROM paper_positions p
           JOIN paper_fills f
             ON f.account_id = p.account_id AND f.order_id = p.entry_order_id
           WHERE p.account_id = $1 AND p.status = 'OPEN'
           LIMIT 1`,
          [paper.id],
        ),
        pool.query<{
          direction: string;
          entry_price: string;
          exit_price: string;
          net_pnl: string;
          exit_reason: string;
          closed_at: Date;
        }>(
          `SELECT direction, entry_price::text, exit_price::text, net_pnl::text,
                  exit_reason, closed_at
           FROM paper_trades
           WHERE account_id = $1
           ORDER BY closed_at DESC LIMIT 8`,
          [paper.id],
        ),
        pool.query<{
          side: string;
          order_type: string;
          status: string;
          quantity: string | null;
          created_at: Date;
        }>(
          `SELECT side, order_type, status, quantity::text, created_at
           FROM paper_orders
           WHERE account_id = $1
           ORDER BY created_at DESC LIMIT 8`,
          [paper.id],
        ),
        pool.query<{
          total_trades: string;
          winning_trades: string;
          net_pnl: string;
        }>(
          `SELECT count(*)::text AS total_trades,
                  count(*) FILTER (WHERE net_pnl > 0)::text AS winning_trades,
                  coalesce(sum(net_pnl), 0)::text AS net_pnl
           FROM paper_trades
           WHERE account_id = $1`,
          [paper.id],
        ),
      ])
    : [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }];

  return {
    generatedAt: new Date().toISOString(),
    mode,
    symbol,
    interval,
    market: {
      candles: [],
      lastPrice: null,
      changePercent: null,
      fresh: false,
      lastCandleAt: null,
    },
    paper: paper
      ? {
          balance: Number(paper.balance),
          equity: Number(paper.equity),
          dailyPnl: Number(paper.daily_realized_pnl),
          dryRun: paper.dry_run,
          lastCandleAt: paper.last_candle_time?.toISOString() ?? null,
          position: positionResult.rows[0]
            ? {
                ...positionResult.rows[0],
                quantity: Number(positionResult.rows[0].quantity),
                entry_price: Number(positionResult.rows[0].entry_price),
                stop_loss: Number(positionResult.rows[0].stop_loss),
                take_profit: Number(positionResult.rows[0].take_profit),
              }
            : null,
          trades: tradesResult.rows.map((trade) => ({
            ...trade,
            entry_price: Number(trade.entry_price),
            exit_price: Number(trade.exit_price),
            net_pnl: Number(trade.net_pnl),
          })),
          orders: ordersResult.rows.map((order) => ({
            ...order,
            quantity: order.quantity === null ? null : Number(order.quantity),
          })),
          summary: {
            totalTrades: Number(paperStatsResult.rows[0]?.total_trades ?? 0),
            winningTrades: Number(
              paperStatsResult.rows[0]?.winning_trades ?? 0,
            ),
            netPnl: Number(paperStatsResult.rows[0]?.net_pnl ?? 0),
          },
        }
      : null,
    testnet: executionResult.rows[0] ?? null,
    risk: riskResult.rows,
    backtest: backtestResult.rows[0] ?? null,
    strategyVersions: strategyVersionsResult.rows.map((strategy) => ({
      ...strategy,
      bot_count: Number(strategy.bot_count),
      active_bot_count: Number(strategy.active_bot_count),
    })),
    bots: botsResult.rows.map((bot) => ({
      ...bot,
      total_capital: Number(bot.total_capital),
      min_trade_amount: Number(bot.min_trade_amount),
      max_trade_amount: Number(bot.max_trade_amount),
      leverage: Number(bot.leverage),
      stop_loss_percent: Number(bot.stop_loss_percent),
      take_profit_percent: Number(bot.take_profit_percent),
      total_trades: Number(bot.total_trades),
      net_pnl: Number(bot.net_pnl),
    })),
    backtests: backtestsResult.rows,
    liveAnalytics: {
      summary: {
        totalTrades: Number(liveStatsResult.rows[0]?.total_trades ?? 0),
        winningTrades: Number(liveStatsResult.rows[0]?.winning_trades ?? 0),
        netPnl: Number(liveStatsResult.rows[0]?.net_pnl ?? 0),
        fees: Number(liveStatsResult.rows[0]?.fees ?? 0),
      },
      trades: liveTradesResult.rows.map((trade) => ({
        ...trade,
        quantity: Number(trade.quantity),
        entry_price: Number(trade.entry_price),
        exit_price: Number(trade.exit_price),
        fees: Number(trade.fees),
        net_pnl: Number(trade.net_pnl),
      })),
      executionStates: executionStatsResult.rows.map((state) => ({
        ...state,
        count: Number(state.count),
      })),
    },
    exchanges: [
      {
        id: "BYBIT",
        name: "Bybit",
        connected: Boolean(executionResult.rows[0]),
        active: Boolean(executionResult.rows[0]?.ready),
        marketData: true,
        environment: "Testnet",
      },
      {
        id: "BINANCE",
        name: "Binance",
        connected: false,
        active: false,
        marketData: false,
        environment: "Not configured",
      },
    ],
    historicalDatasets: historicalResult.rows.map((dataset) => ({
      ...dataset,
      candle_count: Number(dataset.candle_count),
    })),
  };
}

export async function loadBacktestDetail(pool: pg.Pool, id: string) {
  const [runResult, tradesResult, equityResult, decisionsResult] =
    await Promise.all([
      pool.query(
        `SELECT id, strategy_id, strategy_version, symbol, interval_minutes,
                start_time, end_time, candle_count, dataset_hash,
                configuration, metrics, created_at
         FROM backtest_runs WHERE id = $1`,
        [id],
      ),
      pool.query(
        `SELECT id, direction, entry_time, exit_time, quantity::text,
                entry_price::text, exit_price::text, stop_loss::text,
                take_profit::text, gross_pnl::text, fees::text,
                net_pnl::text, exit_reason
         FROM backtest_trades WHERE run_id = $1 ORDER BY entry_time`,
        [id],
      ),
      pool.query(
        `SELECT timestamp, balance::text, equity::text, drawdown::text,
                drawdown_percent::text
         FROM backtest_equity WHERE run_id = $1 ORDER BY timestamp`,
        [id],
      ),
      pool.query(
        `SELECT occurred_at, accepted, reason_code, inputs, output
         FROM risk_decisions WHERE run_id = $1 ORDER BY occurred_at`,
        [id],
      ),
    ]);
  const run = runResult.rows[0];
  if (!run) return null;
  const numeric = (row: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)
          ? Number(value)
          : value,
      ]),
    );
  return {
    run,
    trades: tradesResult.rows.map(numeric),
    equity: equityResult.rows.map(numeric),
    riskDecisions: decisionsResult.rows,
  };
}
