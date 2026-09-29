import { Decimal } from "decimal.js";

export const candleIntervals = [
  "1",
  "3",
  "5",
  "15",
  "30",
  "60",
  "120",
  "240",
  "360",
  "720",
] as const;

export type CandleInterval = (typeof candleIntervals)[number];

export interface Candle {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  turnover: string;
}

export function intervalMilliseconds(interval: CandleInterval): number {
  return Number(interval) * 60_000;
}

export function validateCandle(
  candle: Candle,
  interval: CandleInterval,
): Candle {
  const values = {
    open: new Decimal(candle.open),
    high: new Decimal(candle.high),
    low: new Decimal(candle.low),
    close: new Decimal(candle.close),
    volume: new Decimal(candle.volume),
    turnover: new Decimal(candle.turnover),
  };

  if (!Number.isSafeInteger(candle.openTime)) {
    throw new Error(`Invalid candle timestamp: ${candle.openTime}`);
  }
  if (candle.openTime % intervalMilliseconds(interval) !== 0) {
    throw new Error(`Misaligned candle timestamp: ${candle.openTime}`);
  }
  if (
    !Object.values(values).every((value) => value.isFinite()) ||
    values.open.lte(0) ||
    values.high.lte(0) ||
    values.low.lte(0) ||
    values.close.lte(0) ||
    values.volume.lt(0) ||
    values.turnover.lt(0) ||
    values.high.lt(Decimal.max(values.open, values.close, values.low)) ||
    values.low.gt(Decimal.min(values.open, values.close, values.high))
  ) {
    throw new Error(`Invalid OHLCV candle at ${candle.openTime}`);
  }

  return candle;
}
