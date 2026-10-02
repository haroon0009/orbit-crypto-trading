import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { Pool } from "pg";

import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import { BotRepository, StrategyRepository } from "../src/persistence/bots.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bot:bot@localhost:5433/crypto_bot";

describe("bot and strategy lifecycle", () => {
  let pool: Pool;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    await migrate();
    pool = createPool(databaseUrl);
  });

  after(async () => pool.end());

  it("protects active strategy assignments", async () => {
    const strategyId = `TEST_${randomUUID().replaceAll("-", "").toUpperCase()}`;
    const version = "1";
    const bots = new BotRepository(pool);
    const strategies = new StrategyRepository(pool);
    await pool.query(
      `INSERT INTO strategy_versions
         (strategy_id, version, display_name, configuration)
       VALUES ($1, $2, 'Lifecycle test', '{}')`,
      [strategyId, version],
    );

    try {
      await bots.create({
        name: `Lifecycle ${randomUUID()}`,
        exchange: "BYBIT",
        symbol: "LIFEUSDT",
        interval: 15,
        strategyId,
        strategyVersion: version,
        totalCapital: "1000",
        minTradeAmount: "100",
        maxTradeAmount: "200",
        leverage: "2",
        stopLossPercent: "1",
        takeProfitPercent: "2",
      });
      const row = await pool.query<{ id: string }>(
        "SELECT id FROM bot_assignments WHERE strategy_id = $1 AND strategy_version = $2",
        [strategyId, version],
      );
      const botId = row.rows[0]?.id;
      assert.ok(botId);
      await bots.setActive(botId, true);
      await assert.rejects(
        strategies.setActive(strategyId, version, false),
        /deactivate assigned bots/,
      );
      await assert.rejects(bots.delete(botId), /deactivate the bot/);
      await bots.setActive(botId, false);
      await strategies.setActive(strategyId, version, false);
      await assert.rejects(bots.setActive(botId, true), /strategy is inactive/);
      await assert.rejects(
        strategies.delete(strategyId, version),
        /delete assigned bots/,
      );
      await bots.delete(botId);
      await strategies.delete(strategyId, version);
    } finally {
      await pool.query("DELETE FROM bot_assignments WHERE strategy_id = $1", [
        strategyId,
      ]);
      await pool.query("DELETE FROM strategy_versions WHERE strategy_id = $1", [
        strategyId,
      ]);
    }
  });
});
