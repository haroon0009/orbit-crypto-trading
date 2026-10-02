import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type pg from "pg";

import type {
  Fill,
  Order,
  Position,
  Signal,
  Trade,
} from "../domain/trading.js";
import type { PaperTradingConfig } from "../paper/engine.js";

export type PaperOrderStatus = "PENDING" | "PLANNED" | "REJECTED" | "FILLED";

export interface PendingPaperOrder {
  order: Order;
  signal: Signal;
}

export interface PaperState {
  accountId: string;
  balance: string;
  equity: string;
  dailyRealizedPnl: string;
  dailyPnlDate: string | null;
  lastCandleTime: number | null;
  pending: PendingPaperOrder | null;
  position: Position | null;
}

export interface PaperOrderChange {
  order: Order;
  status: PaperOrderStatus;
  quantity?: string;
  signal?: Signal;
}

export interface PaperCandleChanges {
  timestamp: number;
  balance: string;
  equity: string;
  dailyRealizedPnl: string;
  dailyPnlDate: string;
  orders: PaperOrderChange[];
  fills: Fill[];
  openedPosition?: Position;
  closedTrade?: Trade;
}

export class PaperRepository {
  constructor(private readonly pool: pg.Pool) {}

  async loadOrCreate(
    accountKey: string,
    strategy: { id: string; version: string },
    symbol: string,
    interval: string,
    config: PaperTradingConfig,
  ): Promise<PaperState> {
    await this.pool.query(
      `INSERT INTO paper_accounts
        (id, account_key, strategy_id, strategy_version, symbol, interval_minutes,
         configuration, starting_balance, balance, equity, dry_run)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8, $8, $9)
       ON CONFLICT (account_key) DO NOTHING`,
      [
        randomUUID(),
        accountKey,
        strategy.id,
        strategy.version,
        symbol,
        Number(interval),
        JSON.stringify(config),
        config.startingBalance,
        config.dryRun,
      ],
    );
    const account = await this.pool.query<{
      id: string;
      strategy_id: string;
      strategy_version: string;
      symbol: string;
      interval_minutes: number;
      configuration: unknown;
      balance: string;
      equity: string;
      daily_realized_pnl: string;
      daily_pnl_date: string | null;
      last_candle_time: Date | null;
      dry_run: boolean;
    }>(
      `SELECT id, strategy_id, strategy_version, symbol, interval_minutes,
              configuration, balance::text, equity::text,
              daily_realized_pnl::text, daily_pnl_date::text,
              last_candle_time, dry_run
       FROM paper_accounts WHERE account_key = $1`,
      [accountKey],
    );
    const row = account.rows[0];
    if (!row) throw new Error(`Paper account not found: ${accountKey}`);
    if (
      row.strategy_id !== strategy.id ||
      row.strategy_version !== strategy.version ||
      row.symbol !== symbol ||
      row.interval_minutes !== Number(interval) ||
      row.dry_run !== config.dryRun ||
      !isDeepStrictEqual(row.configuration, config)
    ) {
      throw new Error(`Paper account configuration changed: ${accountKey}`);
    }

    const pending = await this.pool.query<{
      id: string;
      side: Order["side"];
      order_type: Order["type"];
      created_at: Date;
      requested_price: string | null;
      signal: Signal;
    }>(
      `SELECT id, side, order_type, created_at, requested_price::text, signal
       FROM paper_orders
       WHERE account_id = $1 AND status = 'PENDING'
       ORDER BY created_at LIMIT 1`,
      [row.id],
    );
    const pendingRow = pending.rows[0];

    const position = await this.pool.query<{
      direction: Position["direction"];
      quantity: string;
      stop_loss: string;
      take_profit: string;
      reserved_capital: string;
      order_id: string;
      side: Fill["side"];
      price: string;
      fee: string;
      filled_at: Date;
    }>(
      `SELECT p.direction, p.quantity::text, p.stop_loss::text,
              p.take_profit::text, p.reserved_capital::text,
              f.order_id, f.side, f.price::text, f.fee::text, f.filled_at
       FROM paper_positions p
       JOIN paper_fills f
         ON f.account_id = p.account_id AND f.order_id = p.entry_order_id
       WHERE p.account_id = $1 AND p.status = 'OPEN'`,
      [row.id],
    );
    const positionRow = position.rows[0];

    return {
      accountId: row.id,
      balance: row.balance,
      equity: row.equity,
      dailyRealizedPnl: row.daily_realized_pnl,
      dailyPnlDate: row.daily_pnl_date,
      lastCandleTime: row.last_candle_time?.getTime() ?? null,
      pending: pendingRow
        ? {
            order: {
              id: pendingRow.id,
              side: pendingRow.side,
              type: pendingRow.order_type,
              createdAt: pendingRow.created_at.getTime(),
              ...(pendingRow.requested_price === null
                ? {}
                : { requestedPrice: pendingRow.requested_price }),
            },
            signal: pendingRow.signal,
          }
        : null,
      position: positionRow
        ? {
            direction: positionRow.direction,
            quantity: positionRow.quantity,
            entry: {
              orderId: positionRow.order_id,
              side: positionRow.side,
              price: positionRow.price,
              quantity: positionRow.quantity,
              fee: positionRow.fee,
              timestamp: positionRow.filled_at.getTime(),
            },
            stopLoss: positionRow.stop_loss,
            takeProfit: positionRow.take_profit,
            reservedCapital: positionRow.reserved_capital,
          }
        : null,
    };
  }

  async saveCandle(
    accountId: string,
    changes: PaperCandleChanges,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE paper_accounts
         SET balance = $2, equity = $3, daily_realized_pnl = $4,
             daily_pnl_date = $5, last_candle_time = $6, updated_at = now()
         WHERE id = $1 AND (last_candle_time IS NULL OR last_candle_time < $6)`,
        [
          accountId,
          changes.balance,
          changes.equity,
          changes.dailyRealizedPnl,
          changes.dailyPnlDate,
          new Date(changes.timestamp),
        ],
      );
      if (updated.rowCount !== 1) throw new Error("Stale paper candle");

      for (const change of changes.orders) {
        await client.query(
          `INSERT INTO paper_orders
            (account_id, id, side, order_type, status, requested_price,
             quantity, signal, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
           ON CONFLICT (account_id, id) DO UPDATE
           SET status = EXCLUDED.status,
               quantity = COALESCE(EXCLUDED.quantity, paper_orders.quantity),
               updated_at = now()`,
          [
            accountId,
            change.order.id,
            change.order.side,
            change.order.type,
            change.status,
            change.order.requestedPrice ?? null,
            change.quantity ?? null,
            change.signal ? JSON.stringify(change.signal) : null,
            new Date(change.order.createdAt),
          ],
        );
      }
      for (const fill of changes.fills) {
        await client.query(
          `INSERT INTO paper_fills
            (account_id, order_id, side, price, quantity, fee, filled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (account_id, order_id) DO NOTHING`,
          [
            accountId,
            fill.orderId,
            fill.side,
            fill.price,
            fill.quantity,
            fill.fee,
            new Date(fill.timestamp),
          ],
        );
      }
      if (changes.openedPosition) {
        const position = changes.openedPosition;
        await client.query(
          `INSERT INTO paper_positions
            (account_id, entry_order_id, direction, quantity, stop_loss,
             take_profit, reserved_capital, status, opened_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8)`,
          [
            accountId,
            position.entry.orderId,
            position.direction,
            position.quantity,
            position.stopLoss,
            position.takeProfit,
            position.reservedCapital,
            new Date(position.entry.timestamp),
          ],
        );
      }
      if (changes.closedTrade) {
        const trade = changes.closedTrade;
        await client.query(
          `UPDATE paper_positions SET status = 'CLOSED', closed_at = $3
           WHERE account_id = $1 AND entry_order_id = $2 AND status = 'OPEN'`,
          [accountId, trade.entry.orderId, new Date(trade.exit.timestamp)],
        );
        await client.query(
          `INSERT INTO paper_trades
            (account_id, entry_order_id, exit_order_id, direction, quantity,
             entry_price, exit_price, stop_loss, take_profit, gross_pnl,
             fees, net_pnl, exit_reason, opened_at, closed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            accountId,
            trade.entry.orderId,
            trade.exit.orderId,
            trade.direction,
            trade.quantity,
            trade.entry.price,
            trade.exit.price,
            trade.stopLoss,
            trade.takeProfit,
            trade.grossPnl,
            trade.fees,
            trade.netPnl,
            trade.exitReason,
            new Date(trade.entry.timestamp),
            new Date(trade.exit.timestamp),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
