import type { KlineSource } from "../exchanges/bybit/market-data.js";
import type { CandleRepository } from "../persistence/candles.js";
import { intervalMilliseconds, validateCandle } from "./candle.js";
import type { Candle, CandleInterval } from "./candle.js";
import { importHistory } from "./history.js";

export interface FinalizedCandleSource {
  subscribe(
    request: { symbol: string; interval: CandleInterval },
    onCandle: (candle: Candle) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void>;
}

export class LiveCandleFeed {
  constructor(
    private readonly source: FinalizedCandleSource,
    private readonly history: KlineSource,
    private readonly repository: CandleRepository,
  ) {}

  async run(
    symbol: string,
    interval: CandleInterval,
    onCandle: (candle: Candle) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    const instrumentId = await this.repository.ensureInstrument(symbol);
    const duration = intervalMilliseconds(interval);
    let lastOpenTime = await this.repository.latestOpenTime(
      instrumentId,
      interval,
    );

    await this.source.subscribe(
      { symbol, interval },
      async (input) => {
        const candle = validateCandle(input, interval);
        if (lastOpenTime !== null && candle.openTime <= lastOpenTime) return;

        const expected = lastOpenTime === null ? null : lastOpenTime + duration;
        if (expected !== null && candle.openTime > expected) {
          await importHistory(
            { symbol, interval, start: expected, end: candle.openTime },
            this.history,
            this.repository,
          );
          const backfill = await this.repository.getRange(
            instrumentId,
            interval,
            expected,
            candle.openTime,
          );
          for (const missing of backfill) await onCandle(missing);
        }

        await this.repository.insertCandles(instrumentId, interval, [candle]);
        lastOpenTime = candle.openTime;
        await onCandle(candle);
      },
      signal,
    );
  }
}
