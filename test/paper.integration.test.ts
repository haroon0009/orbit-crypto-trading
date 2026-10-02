import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { Pool } from "pg";

import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import type { Signal } from "../src/domain/trading.js";
import type { Candle } from "../src/market-data/candle.js";
import type { CriticalNotifier } from "../src/notifications/telegram.js";
import { PaperTrader, type PaperTradingConfig } from "../src/paper/engine.js";
import { CapitalAllocationRepository } from "../src/persistence/capital.js";
import { PaperRepository } from "../src/persistence/paper.js";
import type { Strategy } from "../src/strategies/strategy.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bot:bot@localhost:5433/crypto_bot";
const start = Date.UTC(2026, 0, 1);
const duration = 15 * 60_000;
const candles: Candle[] = [
  { open: "100", high: "101", low: "99", close: "100" },
  { open: "100", high: "105", low: "97", close: "100" },
  { open: "100", high: "101", low: "94", close: "96" },
].map((prices, index) => ({
  openTime: start + index * duration,
  ...prices,
  volume: "10",
  turnover: "1000",
}));
const config: PaperTradingConfig = {
  startingBalance: "1000",
  feeRate: "0.001",
  slippageBps: "0",
  dryRun: false,
  risk: {
    allocation: "1000",
    leverage: "1",
    sizing: { type: "FIXED_AMOUNT", amount: "100" },
    instrument: {
      tickSize: "1",
      quantityStep: "1",
      minQuantity: "1",
      minNotional: "1",
      maxLeverage: "10",
    },
    policy: {
      maxLeverage: "3",
      maxNotional: "10000",
      maxOpenPositions: 1,
      maxDailyLoss: "1000",
    },
  },
};

class FixtureStrategy implements Strategy {
  readonly id = "PAPER_FIXTURE";
  readonly version = "1";

  onCandle(candle: Readonly<Candle>): Signal | null {
    if (candle.openTime === start) {
      return {
        direction: "LONG",
        stopLoss: "98",
        takeProfit: "104",
        generatedAt: candle.openTime,
      };
    }
    if (candle.openTime === start + duration) {
      return {
        direction: "SHORT",
        stopLoss: "102",
        takeProfit: "96",
        generatedAt: candle.openTime,
      };
    }
    return null;
  }
}

class NoopStrategy implements Strategy {
  readonly id = "NOOP";
  readonly version = "1";
  onCandle(): null {
    return null;
  }
}

describe("paper trading", () => {
  let pool: Pool;
  let paperRepository: PaperRepository;
  let capitalRepository: CapitalAllocationRepository;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    await migrate();
    pool = createPool(databaseUrl);
    paperRepository = new PaperRepository(pool);
    capitalRepository = new CapitalAllocationRepository(pool);
  });

  after(async () => pool.end());

  async function createTrader(
    accountKey: string,
    strategy: Strategy,
    paperConfig: PaperTradingConfig,
    notifier?: CriticalNotifier,
  ) {
    return PaperTrader.create({
      accountKey,
      symbol: "TESTUSDT",
      interval: "15",
      strategy,
      config: paperConfig,
      paperRepository,
      capitalRepository,
      ...(notifier ? { notifier } : {}),
    });
  }

  async function clean(accountKey: string) {
    await pool.query("DELETE FROM paper_accounts WHERE account_key = $1", [
      accountKey,
    ]);
    await pool.query("DELETE FROM capital_allocations WHERE account_key = $1", [
      accountKey,
    ]);
  }

  it("persists fills and trades and recovers pending state after restart", async () => {
    const accountKey = `PAPER-${randomUUID()}`;
    const messages: string[] = [];
    const notifier: CriticalNotifier = {
      async send(message) {
        messages.push(message);
      },
    };
    const strategy = new FixtureStrategy();
    let trader = await createTrader(accountKey, strategy, config, notifier);

    await trader.onCandle(candles[0]!);
    trader = await createTrader(accountKey, strategy, config, notifier);
    assert.ok(trader.snapshot().pending);
    await trader.onCandle(candles[1]!);
    trader = await createTrader(accountKey, strategy, config, notifier);
    assert.ok(trader.snapshot().pending);
    await trader.onCandle(candles[2]!);

    assert.equal(trader.snapshot().balance, "1001.606");
    assert.equal(trader.snapshot().position, null);
    assert.equal(messages.length, 1);
    assert.match(messages[0] ?? "", /stop-loss/);
    const stored = await pool.query<{
      orders: string;
      fills: string;
      positions: string;
      trades: string;
      reserved: string;
      available: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM paper_orders o WHERE o.account_id = a.id) AS orders,
        (SELECT count(*)::text FROM paper_fills f WHERE f.account_id = a.id) AS fills,
        (SELECT count(*)::text FROM paper_positions p WHERE p.account_id = a.id) AS positions,
        (SELECT count(*)::text FROM paper_trades t WHERE t.account_id = a.id) AS trades,
        c.reserved_capital::text AS reserved,
        (SELECT inputs->>'availableCapital' FROM risk_decisions r
         WHERE r.allocation_id = c.id ORDER BY r.id DESC LIMIT 1) AS available
       FROM paper_accounts a
       JOIN capital_allocations c ON c.account_key = a.account_key
       WHERE a.account_key = $1`,
      [accountKey],
    );
    assert.deepEqual(stored.rows[0], {
      orders: "4",
      fills: "4",
      positions: "2",
      trades: "2",
      reserved: "0.000000000000000000",
      available: "997.802",
    });
    await clean(accountKey);
  });

  it("records dry-run plans without changing money or opening positions", async () => {
    const accountKey = `DRY-${randomUUID()}`;
    const dryConfig = { ...config, dryRun: true };
    const strategy: Strategy = {
      id: "ONE_SHOT",
      version: "1",
      onCandle(candle) {
        if (candle.openTime !== start) return null;
        return {
          direction: "LONG",
          stopLoss: "98",
          takeProfit: "104",
          generatedAt: candle.openTime,
        };
      },
    };
    const trader = await createTrader(accountKey, strategy, dryConfig);
    await trader.onCandle(candles[0]!);
    await trader.onCandle(candles[1]!);

    assert.equal(trader.snapshot().balance, "1000");
    assert.equal(trader.snapshot().position, null);
    const stored = await pool.query<{
      plans: string;
      fills: string;
      reserved: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM paper_orders o
         WHERE o.account_id = a.id AND o.status = 'PLANNED') AS plans,
        (SELECT count(*)::text FROM paper_fills f WHERE f.account_id = a.id) AS fills,
        c.reserved_capital::text AS reserved
       FROM paper_accounts a
       JOIN capital_allocations c ON c.account_key = a.account_key
       WHERE a.account_key = $1`,
      [accountKey],
    );
    assert.deepEqual(stored.rows[0], {
      plans: "1",
      fills: "0",
      reserved: "0.000000000000000000",
    });
    await clean(accountKey);
  });

  it("processes and recovers across three days of finalized candles", async () => {
    const accountKey = `SOAK-${randomUUID()}`;
    const strategy = new NoopStrategy();
    let trader = await createTrader(accountKey, strategy, config);
    const candleCount = 3 * 24 * 4;

    for (let index = 0; index < candleCount; index++) {
      if (index > 0 && index % (24 * 4) === 0) {
        trader = await createTrader(accountKey, strategy, config);
      }
      await trader.onCandle({
        openTime: start + index * duration,
        open: "100",
        high: "101",
        low: "99",
        close: "100",
        volume: "1",
        turnover: "100",
      });
    }

    assert.equal(
      trader.snapshot().lastCandleTime,
      start + (candleCount - 1) * duration,
    );
    assert.equal(trader.snapshot().balance, "1000");
    await clean(accountKey);
  });
});
