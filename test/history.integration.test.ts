import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { Pool } from "pg";

import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import type {
  KlineRequest,
  KlineSource,
} from "../src/exchanges/bybit/market-data.js";
import type { Candle } from "../src/market-data/candle.js";
import { importHistory } from "../src/market-data/history.js";
import { CandleRepository } from "../src/persistence/candles.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bot:bot@localhost:5433/crypto_bot";
const symbol = "TESTUSDT";
const start = Date.UTC(2026, 0, 1);
const duration = 15 * 60_000;

const candles: Candle[] = [0, 1, 3].map((offset) => ({
  openTime: start + offset * duration,
  open: "100.000000000000000001",
  high: "101.000000000000000001",
  low: "99.000000000000000001",
  close: "100.500000000000000001",
  volume: "2.5",
  turnover: "250.25",
}));

class FixtureSource implements KlineSource {
  async getKlines(request: KlineRequest): Promise<Candle[]> {
    return candles.filter(
      (candle) =>
        candle.openTime >= request.start && candle.openTime <= request.end,
    );
  }
}

describe("historical candle import", () => {
  let pool: Pool;
  let repository: CandleRepository;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    await migrate();
    pool = createPool(databaseUrl);
    repository = new CandleRepository(pool);
    await pool.query("DELETE FROM instruments WHERE symbol = $1", [symbol]);
  });

  after(async () => {
    await pool.query("DELETE FROM instruments WHERE symbol = $1", [symbol]);
    await pool.end();
  });

  it("is idempotent and reports a missing candle", async () => {
    const range = {
      symbol,
      interval: "15" as const,
      start,
      end: start + 4 * duration,
    };
    const wait = async () => undefined;
    const first = await importHistory(
      range,
      new FixtureSource(),
      repository,
      wait,
    );
    const second = await importHistory(
      range,
      new FixtureSource(),
      repository,
      wait,
    );
    const instrumentId = await repository.ensureInstrument(symbol);
    const verification = await repository.verify(
      instrumentId,
      range.interval,
      range.start,
      range.end,
    );

    assert.deepEqual(first, { downloaded: 3, inserted: 3 });
    assert.deepEqual(second, { downloaded: 3, inserted: 0 });
    assert.equal(verification.count, 3);
    assert.deepEqual(verification.missingOpenTimes, [start + 2 * duration]);
  });
});
