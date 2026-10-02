import { Decimal } from "decimal.js";

import type { Account, Position, Signal } from "../domain/trading.js";
import type { Candle } from "../market-data/candle.js";

export interface StrategyContext {
  account: Readonly<Account>;
  position: Readonly<Position> | null;
}

export interface Strategy {
  readonly id: string;
  readonly version: string;
  onCandle(candle: Readonly<Candle>, context: StrategyContext): Signal | null;
  trailingStop?(position: Readonly<Position>): string | null;
}

export function tightenTrailingStop(
  position: Position,
  candidate: string | null,
): Position {
  if (candidate === null) return position;
  const stop = new Decimal(candidate);
  if (!stop.isFinite() || stop.lte(0)) {
    throw new Error("Invalid trailing stop");
  }
  const current = new Decimal(position.stopLoss);
  const tighter =
    position.direction === "LONG" ? stop.gt(current) : stop.lt(current);
  return tighter ? { ...position, stopLoss: stop.toString() } : position;
}
