import { Decimal } from "decimal.js";

import type { Direction, Signal } from "../domain/trading.js";
import type { Candle } from "../market-data/candle.js";
import type { Strategy, StrategyContext } from "./strategy.js";

export interface HtfTrendPullbackConfig {
  higherTimeframeMinutes?: number;
  higherFastPeriod?: number;
  higherSlowPeriod?: number;
  entryEmaPeriod?: number;
  atrPeriod?: number;
  confirmationBars?: number;
  atrMultiplier?: string;
  structureBufferAtr?: string;
  rewardRisk?: string;
}

interface PendingSetup {
  direction: Direction;
  confirmationPrice: Decimal;
  structureExtreme: Decimal;
  remainingBars: number;
}

export class HtfTrendPullbackStrategy implements Strategy {
  readonly id = "HTF_TREND_PULLBACK";
  readonly version = "1.0.0";
  private readonly higherTimeframeMs: number;
  private readonly higherFastPeriod: number;
  private readonly higherSlowPeriod: number;
  private readonly entryEmaPeriod: number;
  private readonly atrPeriod: number;
  private readonly confirmationBars: number;
  private readonly atrMultiplier: Decimal;
  private readonly structureBufferAtr: Decimal;
  private readonly rewardRisk: Decimal;
  private higherBucket: number | null = null;
  private higherBucketClose: Decimal | null = null;
  private higherFast: Decimal | null = null;
  private higherSlow: Decimal | null = null;
  private previousHigherSlow: Decimal | null = null;
  private higherCandles = 0;
  private entryEma: Decimal | null = null;
  private entryCandles = 0;
  private previousClose: Decimal | null = null;
  private atr: Decimal | null = null;
  private readonly trueRanges: Decimal[] = [];
  private setup: PendingSetup | null = null;

  constructor(config: HtfTrendPullbackConfig = {}) {
    const higherTimeframeMinutes = config.higherTimeframeMinutes ?? 240;
    this.higherTimeframeMs = higherTimeframeMinutes * 60_000;
    this.higherFastPeriod = config.higherFastPeriod ?? 20;
    this.higherSlowPeriod = config.higherSlowPeriod ?? 50;
    this.entryEmaPeriod = config.entryEmaPeriod ?? 20;
    this.atrPeriod = config.atrPeriod ?? 14;
    this.confirmationBars = config.confirmationBars ?? 3;
    this.atrMultiplier = new Decimal(config.atrMultiplier ?? "1.5");
    this.structureBufferAtr = new Decimal(config.structureBufferAtr ?? "0.25");
    this.rewardRisk = new Decimal(config.rewardRisk ?? "2");
    if (
      !Number.isInteger(higherTimeframeMinutes) ||
      higherTimeframeMinutes < 2 ||
      !Number.isInteger(this.higherFastPeriod) ||
      this.higherFastPeriod < 1 ||
      !Number.isInteger(this.higherSlowPeriod) ||
      this.higherSlowPeriod <= this.higherFastPeriod ||
      !Number.isInteger(this.entryEmaPeriod) ||
      this.entryEmaPeriod < 1 ||
      !Number.isInteger(this.atrPeriod) ||
      this.atrPeriod < 2 ||
      !Number.isInteger(this.confirmationBars) ||
      this.confirmationBars < 1
    ) {
      throw new Error("Invalid multi-timeframe periods");
    }
    if (
      this.atrMultiplier.lte(0) ||
      this.structureBufferAtr.lt(0) ||
      this.rewardRisk.lte(0)
    ) {
      throw new Error("Invalid pullback protection");
    }
  }

  onCandle(candle: Readonly<Candle>, context: StrategyContext): Signal | null {
    const high = new Decimal(candle.high);
    const low = new Decimal(candle.low);
    const close = new Decimal(candle.close);
    const pullbackEma = this.entryEma;
    this.entryEma = this.ema(close, this.entryEma, this.entryEmaPeriod);
    this.entryCandles += 1;
    this.updateAtr(high, low, close);
    this.updateHigherTimeframe(candle.openTime, close);

    const trend = this.higherTrend();
    if (
      context.position ||
      !trend ||
      !pullbackEma ||
      !this.atr ||
      this.entryCandles <= this.entryEmaPeriod
    ) {
      this.setup = null;
      return null;
    }

    if (this.setup) {
      if (this.setup.direction !== trend) {
        this.setup = null;
        return null;
      }
      this.setup.structureExtreme =
        trend === "LONG"
          ? Decimal.min(this.setup.structureExtreme, low)
          : Decimal.max(this.setup.structureExtreme, high);
      const confirmed =
        trend === "LONG"
          ? close.gt(this.setup.confirmationPrice) && close.gt(this.entryEma)
          : close.lt(this.setup.confirmationPrice) && close.lt(this.entryEma);
      if (confirmed) {
        const setup = this.setup;
        this.setup = null;
        return this.createSignal(setup, close, candle.openTime);
      }
      this.setup.remainingBars -= 1;
      if (this.setup.remainingBars === 0) this.setup = null;
      return null;
    }

    if (
      trend === "LONG" &&
      low.lte(pullbackEma) &&
      close.gt(this.higherSlow!)
    ) {
      this.setup = {
        direction: trend,
        confirmationPrice: high,
        structureExtreme: low,
        remainingBars: this.confirmationBars,
      };
    } else if (
      trend === "SHORT" &&
      high.gte(pullbackEma) &&
      close.lt(this.higherSlow!)
    ) {
      this.setup = {
        direction: trend,
        confirmationPrice: low,
        structureExtreme: high,
        remainingBars: this.confirmationBars,
      };
    }
    return null;
  }

  private higherTrend(): Direction | null {
    if (
      this.higherCandles < this.higherSlowPeriod ||
      !this.higherFast ||
      !this.higherSlow ||
      !this.previousHigherSlow
    ) {
      return null;
    }
    if (
      this.higherFast.gt(this.higherSlow) &&
      this.higherSlow.gt(this.previousHigherSlow)
    ) {
      return "LONG";
    }
    if (
      this.higherFast.lt(this.higherSlow) &&
      this.higherSlow.lt(this.previousHigherSlow)
    ) {
      return "SHORT";
    }
    return null;
  }

  private updateHigherTimeframe(openTime: number, close: Decimal) {
    const bucket = Math.floor(openTime / this.higherTimeframeMs);
    if (this.higherBucket === null) {
      this.higherBucket = bucket;
      this.higherBucketClose = close;
      return;
    }
    if (bucket < this.higherBucket) {
      throw new Error("Candles must be ordered by open time");
    }
    if (bucket === this.higherBucket) {
      this.higherBucketClose = close;
      return;
    }
    this.previousHigherSlow = this.higherSlow;
    this.higherFast = this.ema(
      this.higherBucketClose!,
      this.higherFast,
      this.higherFastPeriod,
    );
    this.higherSlow = this.ema(
      this.higherBucketClose!,
      this.higherSlow,
      this.higherSlowPeriod,
    );
    this.higherCandles += 1;
    this.higherBucket = bucket;
    this.higherBucketClose = close;
  }

  private updateAtr(high: Decimal, low: Decimal, close: Decimal) {
    if (this.previousClose) {
      const trueRange = Decimal.max(
        high.minus(low),
        high.minus(this.previousClose).abs(),
        low.minus(this.previousClose).abs(),
      );
      if (this.trueRanges.length < this.atrPeriod) {
        this.trueRanges.push(trueRange);
        if (this.trueRanges.length === this.atrPeriod) {
          this.atr = Decimal.sum(...this.trueRanges).div(this.atrPeriod);
        }
      } else {
        this.atr = this.atr!.mul(this.atrPeriod - 1)
          .plus(trueRange)
          .div(this.atrPeriod);
      }
    }
    this.previousClose = close;
  }

  private createSignal(
    setup: PendingSetup,
    close: Decimal,
    generatedAt: number,
  ): Signal | null {
    const atrRisk = this.atr!.mul(this.atrMultiplier);
    const buffer = this.atr!.mul(this.structureBufferAtr);
    const stopLoss =
      setup.direction === "LONG"
        ? Decimal.min(
            close.minus(atrRisk),
            setup.structureExtreme.minus(buffer),
          )
        : Decimal.max(close.plus(atrRisk), setup.structureExtreme.plus(buffer));
    const risk = close.minus(stopLoss).abs();
    const takeProfit =
      setup.direction === "LONG"
        ? close.plus(risk.mul(this.rewardRisk))
        : close.minus(risk.mul(this.rewardRisk));
    if (stopLoss.lte(0) || takeProfit.lte(0)) return null;
    return {
      direction: setup.direction,
      stopLoss: stopLoss.toString(),
      takeProfit: takeProfit.toString(),
      generatedAt,
    };
  }

  private ema(value: Decimal, previous: Decimal | null, period: number) {
    if (!previous) return value;
    return value
      .minus(previous)
      .mul(new Decimal(2).div(period + 1))
      .plus(previous);
  }
}
