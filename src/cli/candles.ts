import { parseArgs } from "node:util";

import { BybitMarketDataClient } from "../exchanges/bybit/market-data.js";
import {
  candleIntervals,
  intervalMilliseconds,
  type CandleInterval,
} from "../market-data/candle.js";
import { importHistory, validateRange } from "../market-data/history.js";
import { CandleRepository } from "../persistence/candles.js";
import { loadConfig } from "../config.js";
import { migrate } from "../db/migrate.js";
import { createPool } from "../db/pool.js";
import { createLogger } from "../logger.js";

function parseTimestamp(value: string, name: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid ${name}: ${value}`);
  return timestamp;
}

const command = process.argv[2];
if (command !== "import" && command !== "verify") {
  throw new Error(
    "Usage: candles.ts <import|verify> --symbol BTCUSDT --interval 15 --start 2023-01-01 [--end 2026-01-01]",
  );
}

const { values } = parseArgs({
  args: process.argv.slice(3),
  options: {
    symbol: { type: "string" },
    interval: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
  },
  strict: true,
});

if (!values.symbol || !values.interval || !values.start) {
  throw new Error("--symbol, --interval, and --start are required");
}
if (!candleIntervals.includes(values.interval as CandleInterval)) {
  throw new Error(`Unsupported interval: ${values.interval}`);
}

const interval = values.interval as CandleInterval;
const duration = intervalMilliseconds(interval);
const end = values.end
  ? parseTimestamp(values.end, "end")
  : Math.floor(Date.now() / duration) * duration;
const range = {
  symbol: values.symbol.toUpperCase(),
  interval,
  start: parseTimestamp(values.start, "start"),
  end,
};
validateRange(range);

const config = loadConfig();
const logger = createLogger(config);
await migrate();
const pool = createPool(config.DATABASE_URL);
const repository = new CandleRepository(pool);

try {
  if (command === "import") {
    const result = await importHistory(
      range,
      new BybitMarketDataClient(),
      repository,
    );
    logger.info({ ...range, ...result }, "candle import completed");
  }

  const instrumentId = await repository.ensureInstrument(range.symbol);
  const verification = await repository.verify(
    instrumentId,
    range.interval,
    range.start,
    range.end,
  );
  logger.info(
    {
      count: verification.count,
      missing: verification.missingOpenTimes.length,
      firstMissing: verification.missingOpenTimes
        .slice(0, 20)
        .map((timestamp) => new Date(timestamp).toISOString()),
    },
    "candle verification completed",
  );
  if (verification.missingOpenTimes.length > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
