import { randomUUID } from "node:crypto";

import { Decimal } from "decimal.js";
import type pg from "pg";
import { z } from "zod";

const decimal = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, "must be a positive number")
  .refine((value) => new Decimal(value).gt(0), "must be greater than zero");

const allowedIntervals = new Set([1, 3, 5, 15, 30, 60, 240, 1440]);

export const botAssignmentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    exchange: z.literal("BYBIT"),
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{3,20}$/),
    interval: z.coerce
      .number()
      .int()
      .refine((value) => allowedIntervals.has(value), "unsupported interval"),
    strategyId: z.string().trim().min(1).max(80),
    strategyVersion: z.string().trim().min(1).max(40),
    totalCapital: decimal,
    minTradeAmount: decimal,
    maxTradeAmount: decimal,
    leverage: decimal,
    stopLossPercent: decimal,
    takeProfitPercent: decimal,
  })
  .superRefine((input, context) => {
    if (new Decimal(input.minTradeAmount).gt(input.maxTradeAmount)) {
      context.addIssue({
        code: "custom",
        path: ["maxTradeAmount"],
        message: "must be at least the minimum trade amount",
      });
    }
    if (new Decimal(input.maxTradeAmount).gt(input.totalCapital)) {
      context.addIssue({
        code: "custom",
        path: ["maxTradeAmount"],
        message: "cannot exceed total capital",
      });
    }
  });

export type BotAssignmentInput = z.infer<typeof botAssignmentSchema>;

export class BotRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: BotAssignmentInput): Promise<void> {
    try {
      const result = await this.pool.query(
        `INSERT INTO bot_assignments
          (id, name, exchange, symbol, interval_minutes, strategy_id,
           strategy_version, total_capital, min_trade_amount, max_trade_amount,
           leverage, stop_loss_percent, take_profit_percent)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
         FROM strategy_versions
         WHERE strategy_id = $6 AND version = $7 AND active`,
        [
          randomUUID(),
          input.name,
          input.exchange,
          input.symbol,
          input.interval,
          input.strategyId,
          input.strategyVersion,
          input.totalCapital,
          input.minTradeAmount,
          input.maxTradeAmount,
          input.leverage,
          input.stopLossPercent,
          input.takeProfitPercent,
        ],
      );
      if (result.rowCount !== 1) {
        throw new Error("Conflict: strategy version is inactive or missing");
      }
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new Error(
          "Invalid assignment: that name or exchange/ticker/timeframe is already assigned",
        );
      }
      throw error;
    }
  }

  async update(id: string, input: BotAssignmentInput): Promise<void> {
    try {
      const result = await this.pool.query(
        `UPDATE bot_assignments b
         SET name = $2, exchange = $3, symbol = $4, interval_minutes = $5,
             strategy_id = $6, strategy_version = $7, total_capital = $8,
             min_trade_amount = $9, max_trade_amount = $10, leverage = $11,
             stop_loss_percent = $12, take_profit_percent = $13,
             updated_at = now()
         FROM strategy_versions s
         WHERE b.id = $1 AND NOT b.active
           AND s.strategy_id = $6 AND s.version = $7 AND s.active`,
        [
          id,
          input.name,
          input.exchange,
          input.symbol,
          input.interval,
          input.strategyId,
          input.strategyVersion,
          input.totalCapital,
          input.minTradeAmount,
          input.maxTradeAmount,
          input.leverage,
          input.stopLossPercent,
          input.takeProfitPercent,
        ],
      );
      if (result.rowCount !== 1) {
        throw new Error(
          "Conflict: deactivate the bot and use an active strategy before editing",
        );
      }
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new Error(
          "Invalid assignment: that name or exchange/ticker/timeframe is already assigned",
        );
      }
      throw error;
    }
  }

  async setActive(id: string, active: boolean): Promise<void> {
    if (!active) {
      const result = await this.pool.query(
        "UPDATE bot_assignments SET active = false, updated_at = now() WHERE id = $1",
        [id],
      );
      if (result.rowCount !== 1) throw new Error("Invalid bot assignment");
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const assignable = await client.query(
        `SELECT b.id
         FROM bot_assignments b
         JOIN strategy_versions s
           ON s.strategy_id = b.strategy_id AND s.version = b.strategy_version
         WHERE b.id = $1 AND s.active
         FOR UPDATE OF b, s`,
        [id],
      );
      if (assignable.rowCount !== 1) {
        throw new Error("Conflict: bot is missing or its strategy is inactive");
      }
      await client.query(
        "UPDATE bot_assignments SET active = true, updated_at = now() WHERE id = $1",
        [id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<void> {
    const result = await this.pool.query(
      "DELETE FROM bot_assignments WHERE id = $1 AND NOT active",
      [id],
    );
    if (result.rowCount !== 1) {
      throw new Error("Conflict: deactivate the bot before deleting it");
    }
  }
}

export class StrategyRepository {
  constructor(private readonly pool: pg.Pool) {}

  async setActive(
    strategyId: string,
    version: string,
    active: boolean,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const strategy = await client.query(
        `SELECT 1 FROM strategy_versions
         WHERE strategy_id = $1 AND version = $2 FOR UPDATE`,
        [strategyId, version],
      );
      if (strategy.rowCount !== 1) throw new Error("Invalid strategy version");
      if (!active) {
        const assigned = await client.query(
          `SELECT 1 FROM bot_assignments
           WHERE strategy_id = $1 AND strategy_version = $2 AND active
           LIMIT 1`,
          [strategyId, version],
        );
        if (assigned.rowCount) {
          throw new Error(
            "Conflict: deactivate assigned bots before deactivating this strategy",
          );
        }
      }
      await client.query(
        `UPDATE strategy_versions SET active = $3
         WHERE strategy_id = $1 AND version = $2`,
        [strategyId, version, active],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(strategyId: string, version: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const strategy = await client.query(
        `SELECT 1 FROM strategy_versions
         WHERE strategy_id = $1 AND version = $2 FOR UPDATE`,
        [strategyId, version],
      );
      if (strategy.rowCount !== 1) throw new Error("Invalid strategy version");
      const assigned = await client.query<{ total: string; active: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE active)::text AS active
         FROM bot_assignments
         WHERE strategy_id = $1 AND strategy_version = $2`,
        [strategyId, version],
      );
      if (Number(assigned.rows[0]?.total) > 0) {
        throw new Error(
          Number(assigned.rows[0]?.active) > 0
            ? "Conflict: deactivate assigned bots before deleting this strategy"
            : "Conflict: delete assigned bots before deleting this strategy",
        );
      }
      await client.query(
        "DELETE FROM strategy_versions WHERE strategy_id = $1 AND version = $2",
        [strategyId, version],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
