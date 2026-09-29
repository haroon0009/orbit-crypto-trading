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
}
