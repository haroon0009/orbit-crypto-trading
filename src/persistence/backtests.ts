import type pg from "pg";

import type { BacktestResult } from "../backtest/engine.js";

export class BacktestRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(result: BacktestResult): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO backtest_runs
          (id, strategy_id, strategy_version, symbol, interval_minutes,
           start_time, end_time, candle_count, dataset_hash, configuration, metrics)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
        [
          result.runId,
          result.strategyId,
          result.strategyVersion,
          result.symbol,
          Number(result.interval),
          new Date(result.startTime),
          new Date(result.endTime),
          result.candleCount,
          result.datasetHash,
          JSON.stringify(result.config),
          JSON.stringify(result.metrics),
        ],
      );

      for (const decision of result.riskDecisions) {
        await client.query(
          `INSERT INTO risk_decisions
            (run_id, occurred_at, accepted, reason_code, inputs, output)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
          [
            result.runId,
            new Date(decision.request.timestamp),
            decision.accepted,
            decision.reason,
            JSON.stringify(decision.request),
            JSON.stringify(decision),
          ],
        );
      }

      for (const trade of result.trades) {
        await client.query(
          `INSERT INTO backtest_trades
            (run_id, direction, entry_time, exit_time, quantity, entry_price,
             exit_price, stop_loss, take_profit, gross_pnl, fees, net_pnl, exit_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            result.runId,
            trade.direction,
            new Date(trade.entry.timestamp),
            new Date(trade.exit.timestamp),
            trade.quantity,
            trade.entry.price,
            trade.exit.price,
            trade.stopLoss,
            trade.takeProfit,
            trade.grossPnl,
            trade.fees,
            trade.netPnl,
            trade.exitReason,
          ],
        );
      }

      for (let offset = 0; offset < result.equity.length; offset += 500) {
        const batch = result.equity.slice(offset, offset + 500);
        const values: unknown[] = [];
        const placeholders = batch.map((point, index) => {
          const parameter = index * 6;
          values.push(
            result.runId,
            new Date(point.timestamp),
            point.balance,
            point.equity,
            point.drawdown,
            point.drawdownPercent,
          );
          return `(${Array.from({ length: 6 }, (_, i) => `$${parameter + i + 1}`).join(", ")})`;
        });
        await client.query(
          `INSERT INTO backtest_equity
            (run_id, timestamp, balance, equity, drawdown, drawdown_percent)
           VALUES ${placeholders.join(", ")}`,
          values,
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
