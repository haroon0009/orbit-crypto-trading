import { setTimeout as sleep } from "node:timers/promises";

import type { KlineSource } from "../exchanges/bybit/market-data.js";
import type { CandleRepository } from "../persistence/candles.js";
import {
  intervalMilliseconds,
  validateCandle,
  type CandleInterval,
} from "./candle.js";

export interface HistoryRange {
  symbol: string;
  interval: CandleInterval;
  start: number;
  end: number;
}

export interface ImportResult {
  downloaded: number;
  inserted: number;
}

export function validateRange(range: HistoryRange): void {
  const duration = intervalMilliseconds(range.interval);
  if (!/^[A-Z0-9]+$/.test(range.symbol)) throw new Error("Invalid symbol");
  if (range.start >= range.end) throw new Error("Start must be before end");
  if (range.start % duration !== 0 || range.end % duration !== 0) {
    throw new Error("Start and end must align with the candle interval");
  }
}

export async function importHistory(
  range: HistoryRange,
  source: KlineSource,
  repository: CandleRepository,
  wait: (milliseconds: number) => Promise<unknown> = sleep,
): Promise<ImportResult> {
  validateRange(range);
  const instrumentId = await repository.ensureInstrument(range.symbol);
  const duration = intervalMilliseconds(range.interval);
  let downloaded = 0;
  let inserted = 0;

  for (let cursor = range.start; cursor < range.end;) {
    const pageEndExclusive = Math.min(range.end, cursor + duration * 1000);
    const pageEnd = pageEndExclusive - 1;
    const existing = await repository.verify(
      instrumentId,
      range.interval,
      cursor,
      pageEndExclusive,
    );
    if (existing.missingOpenTimes.length === 0) {
      cursor = pageEndExclusive;
      continue;
    }
    const candles = (
      await source.getKlines({
        symbol: range.symbol,
        interval: range.interval,
        start: cursor,
        end: pageEnd,
      })
    )
      .filter(
        (candle) => candle.openTime >= cursor && candle.openTime <= pageEnd,
      )
      .map((candle) => validateCandle(candle, range.interval));

    if (
      new Set(candles.map((candle) => candle.openTime)).size !== candles.length
    ) {
      throw new Error(`Duplicate candles returned near ${cursor}`);
    }

    downloaded += candles.length;
    inserted += await repository.insertCandles(
      instrumentId,
      range.interval,
      candles,
    );
    cursor = pageEndExclusive;
    if (cursor < range.end) await wait(250);
  }

  return { downloaded, inserted };
}
