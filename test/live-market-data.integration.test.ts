import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { Pool } from "pg";

import {
  parseFinalizedKlines,
  parseKlineUpdates,
} from "../src/exchanges/bybit/kline-stream.js";
import type { KlineSource } from "../src/exchanges/bybit/market-data.js";
import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import type { Candle } from "../src/market-data/candle.js";
import {
  LiveCandleFeed,
  type FinalizedCandleSource,
} from "../src/market-data/live.js";
import { CandleRepository } from "../src/persistence/candles.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bot:bot@localhost:5433/crypto_bot";
const duration = 15 * 60_000;
const start = Date.UTC(2026, 0, 1);

function candle(openTime: number): Candle {
  return {
    openTime,
    open: "100",
    high: "101",
    low: "99",
    close: "100",
    volume: "1",
    turnover: "100",
  };
}

describe("live Bybit market data", () => {
  let pool: Pool;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    await migrate();
    pool = createPool(databaseUrl);
  });

  after(async () => pool.end());

  it("ignores unfinished WebSocket updates", () => {
    const data = (confirm: boolean) => ({
      start,
      open: "100",
      high: "101",
      low: "99",
      close: "100",
      volume: "1",
      turnover: "100",
      confirm,
    });
    const raw = JSON.stringify({
      topic: "kline.15.BTCUSDT",
      data: [data(false), data(true)],
    });
    assert.equal(parseFinalizedKlines(raw, "BTCUSDT", "15").length, 1);
    assert.deepEqual(
      parseKlineUpdates(raw, "BTCUSDT", "15").map((update) => update.finalized),
      [false, true],
    );
  });

  it("backfills a reconnect gap before delivering the newest candle", async () => {
    const symbol = `T${randomUUID().replaceAll("-", "").toUpperCase()}`;
    const source: FinalizedCandleSource = {
      async subscribe(_request, onCandle) {
        await onCandle(candle(start));
        await onCandle(candle(start + duration * 2));
      },
    };
    const history: KlineSource = {
      async getKlines() {
        return [candle(start + duration)];
      },
    };
    const repository = new CandleRepository(pool);
    const delivered: number[] = [];

    await new LiveCandleFeed(source, history, repository).run(
      symbol,
      "15",
      async (value) => {
        delivered.push(value.openTime);
      },
      new AbortController().signal,
    );

    assert.deepEqual(delivered, [
      start,
      start + duration,
      start + duration * 2,
    ]);
    const instrumentId = await repository.ensureInstrument(symbol);
    assert.equal(
      (
        await repository.getRange(
          instrumentId,
          "15",
          start,
          start + duration * 3,
        )
      ).length,
      3,
    );
    await pool.query("DELETE FROM instruments WHERE id = $1", [instrumentId]);
  });
});
