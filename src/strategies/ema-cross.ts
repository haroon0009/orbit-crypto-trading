import { Decimal } from "decimal.js";

import type { Signal } from "../domain/trading.js";
import type { Candle } from "../market-data/candle.js";
import type { Strategy, StrategyContext } from "./strategy.js";

export class EmaCrossStrategy implements Strategy {
  readonly id = "EMA_CROSS";
  readonly version = "1.0.0";
  private candles = 0;
  private fast: Decimal | null = null;
  private slow: Decimal | null = null;

  constructor(
    private readonly fastPeriod = 20,
    private readonly slowPeriod = 50,
    private readonly stopLossPercent = "1",
    private readonly takeProfitPercent = "2",
  ) {
    if (fastPeriod < 1 || slowPeriod <= fastPeriod) {
      throw new Error("Invalid EMA periods");
    }
    if (
      new Decimal(stopLossPercent).lte(0) ||
      new Decimal(takeProfitPercent).lte(0)
    ) {
      throw new Error("Invalid EMA protection percentages");
    }
  }

  onCandle(candle: Readonly<Candle>, context: StrategyContext): Signal | null {
    const close = new Decimal(candle.close);
    const previousFast = this.fast;
    const previousSlow = this.slow;
    this.fast = this.ema(close, this.fast, this.fastPeriod);
    this.slow = this.ema(close, this.slow, this.slowPeriod);
    this.candles += 1;

    if (
      context.position ||
      this.candles < this.slowPeriod ||
      !previousFast ||
      !previousSlow
    ) {
      return null;
    }

    const crossedUp = previousFast.lte(previousSlow) && this.fast.gt(this.slow);
    const crossedDown =
      previousFast.gte(previousSlow) && this.fast.lt(this.slow);
    if (!crossedUp && !crossedDown) return null;

    const direction = crossedUp ? "LONG" : "SHORT";
    const stopMultiplier = new Decimal(this.stopLossPercent).div(100);
    const targetMultiplier = new Decimal(this.takeProfitPercent).div(100);
    return {
      direction,
      stopLoss: close
        .mul(
          direction === "LONG"
            ? stopMultiplier.negated().plus(1)
            : stopMultiplier.plus(1),
        )
        .toString(),
      takeProfit: close
        .mul(
          direction === "LONG"
            ? targetMultiplier.plus(1)
            : new Decimal(1).minus(targetMultiplier),
        )
        .toString(),
      generatedAt: candle.openTime,
    };
  }

  private ema(close: Decimal, previous: Decimal | null, period: number) {
    if (!previous) return close;
    const multiplier = new Decimal(2).div(period + 1);
    return close.minus(previous).mul(multiplier).plus(previous);
  }
}
