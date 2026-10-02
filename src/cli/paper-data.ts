import { parseArgs } from "node:util";

import { candleIntervals, type CandleInterval } from "../market-data/candle.js";
import { loadConfig } from "../config.js";
import { createPool } from "../db/pool.js";
import { BybitKlineStream } from "../exchanges/bybit/kline-stream.js";
import { BybitMarketDataClient } from "../exchanges/bybit/market-data.js";
import { LiveCandleFeed } from "../market-data/live.js";
import { createLogger } from "../logger.js";
import { CandleRepository } from "../persistence/candles.js";

const { values } = parseArgs({
  options: {
    symbol: { type: "string", default: "BTCUSDT" },
    interval: { type: "string", default: "15" },
  },
});
const symbol = values.symbol.toUpperCase();
if (!/^[A-Z0-9]+$/.test(symbol)) throw new Error("Invalid symbol");
if (!candleIntervals.includes(values.interval as CandleInterval)) {
  throw new Error("Invalid interval");
}
const interval = values.interval as CandleInterval;
const config = loadConfig();
if (config.TRADING_MODE !== "PAPER") {
  throw new Error("paper:data requires TRADING_MODE=PAPER");
}

const logger = createLogger(config);
const pool = createPool(config.DATABASE_URL);
const controller = new AbortController();
for (const event of ["SIGINT", "SIGTERM"] as const) {
  process.once(event, () => controller.abort());
}

try {
  logger.info({ symbol, interval }, "paper candle feed started");
  await new LiveCandleFeed(
    new BybitKlineStream(),
    new BybitMarketDataClient(),
    new CandleRepository(pool),
  ).run(
    symbol,
    interval,
    async (candle) => {
      logger.info(
        { symbol, interval, openTime: candle.openTime },
        "finalized candle stored",
      );
    },
    controller.signal,
  );
} finally {
  await pool.end();
}
