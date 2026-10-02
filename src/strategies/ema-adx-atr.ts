import { Decimal } from "decimal.js";

import type { Signal } from "../domain/trading.js";
import type { Candle } from "../market-data/candle.js";
import type { Strategy, StrategyContext } from "./strategy.js";

export interface EmaAdxAtrConfig {
  fastPeriod?: number;
  slowPeriod?: number;
  indicatorPeriod?: number;
  minimumAdx?: string;
  atrMultiplier?: string;
  rewardRisk?: string;
  confirmationBars?: number;
}

interface PendingSetup {
  direction: "LONG" | "SHORT";
  confirmationPrice: Decimal;
  remainingBars: number;
}

export class EmaAdxAtrStrategy implements Strategy {
  readonly id = "EMA_ADX_ATR";
  readonly version = "1.0.0";
  private readonly fastPeriod: number;
  private readonly slowPeriod: number;
  private readonly indicatorPeriod: number;
  private readonly minimumAdx: Decimal;
  private readonly atrMultiplier: Decimal;
  private readonly rewardRisk: Decimal;
  private readonly confirmationBars: number;
  private setup: PendingSetup | null = null;
  private candles = 0;
  private fast: Decimal | null = null;
  private slow: Decimal | null = null;
  private previousHigh: Decimal | null = null;
  private previousLow: Decimal | null = null;
  private previousClose: Decimal | null = null;
  private atr: Decimal | null = null;
  private plusDm: Decimal | null = null;
  private minusDm: Decimal | null = null;
  private adx: Decimal | null = null;
  private readonly trSeed: Decimal[] = [];
  private readonly plusDmSeed: Decimal[] = [];
  private readonly minusDmSeed: Decimal[] = [];
  private readonly dxSeed: Decimal[] = [];

  constructor(config: EmaAdxAtrConfig = {}) {
    this.fastPeriod = config.fastPeriod ?? 20;
    this.slowPeriod = config.slowPeriod ?? 50;
    this.indicatorPeriod = config.indicatorPeriod ?? 14;
    this.minimumAdx = new Decimal(config.minimumAdx ?? "25");
    this.atrMultiplier = new Decimal(config.atrMultiplier ?? "1.5");
    this.rewardRisk = new Decimal(config.rewardRisk ?? "2");
    this.confirmationBars = config.confirmationBars ?? 3;
    if (this.fastPeriod < 1 || this.slowPeriod <= this.fastPeriod) {
      throw new Error("Invalid EMA periods");
    }
    if (this.indicatorPeriod < 2) throw new Error("Invalid indicator period");
    if (this.minimumAdx.lt(0) || this.minimumAdx.gt(100)) {
      throw new Error("Invalid ADX threshold");
    }
    if (this.atrMultiplier.lte(0) || this.rewardRisk.lte(0)) {
      throw new Error("Invalid ATR protection");
    }
    if (!Number.isInteger(this.confirmationBars) || this.confirmationBars < 1) {
      throw new Error("Invalid confirmation window");
    }
  }

  onCandle(candle: Readonly<Candle>, context: StrategyContext): Signal | null {
    const close = new Decimal(candle.close);
    const previousFast = this.fast;
    const previousSlow = this.slow;
    this.fast = this.ema(close, this.fast, this.fastPeriod);
    this.slow = this.ema(close, this.slow, this.slowPeriod);
    this.updateDirection(candle);
    this.candles += 1;

    if (
      this.candles < this.slowPeriod ||
      !previousFast ||
      !previousSlow ||
      !this.atr ||
      !this.adx ||
      this.adx.lt(this.minimumAdx)
    ) {
      this.setup = null;
      return null;
    }
    if (context.position) {
      this.setup = null;
      return null;
    }

    const trend =
      this.fast.gt(this.slow) && this.slow.gte(previousSlow)
        ? "LONG"
        : this.fast.lt(this.slow) && this.slow.lte(previousSlow)
          ? "SHORT"
          : null;
    if (this.setup) {
      if (trend !== this.setup.direction) {
        this.setup = null;
        return null;
      }
      const confirmed =
        trend === "LONG"
          ? close.gt(this.setup.confirmationPrice) && close.gt(this.fast)
          : close.lt(this.setup.confirmationPrice) && close.lt(this.fast);
      if (confirmed) {
        this.setup = null;
        return this.createSignal(trend, close, candle.openTime);
      }
      this.setup.remainingBars -= 1;
      if (this.setup.remainingBars === 0) this.setup = null;
      return null;
    }

    const high = new Decimal(candle.high);
    const low = new Decimal(candle.low);
    if (trend === "LONG" && close.lte(this.fast) && close.gt(this.slow)) {
      this.setup = {
        direction: trend,
        confirmationPrice: high,
        remainingBars: this.confirmationBars,
      };
    } else if (
      trend === "SHORT" &&
      close.gte(this.fast) &&
      close.lt(this.slow)
    ) {
      this.setup = {
        direction: trend,
        confirmationPrice: low,
        remainingBars: this.confirmationBars,
      };
    }
    return null;
  }

  private createSignal(
    direction: "LONG" | "SHORT",
    close: Decimal,
    generatedAt: number,
  ): Signal | null {
    const risk = this.atr!.mul(this.atrMultiplier);
    const stopLoss =
      direction === "LONG" ? close.minus(risk) : close.plus(risk);
    const takeProfit =
      direction === "LONG"
        ? close.plus(risk.mul(this.rewardRisk))
        : close.minus(risk.mul(this.rewardRisk));
    if (stopLoss.lte(0) || takeProfit.lte(0)) return null;
    return {
      direction,
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

  private updateDirection(candle: Readonly<Candle>) {
    const high = new Decimal(candle.high);
    const low = new Decimal(candle.low);
    const close = new Decimal(candle.close);
    if (!this.previousHigh || !this.previousLow || !this.previousClose) {
      this.previousHigh = high;
      this.previousLow = low;
      this.previousClose = close;
      return;
    }

    const trueRange = Decimal.max(
      high.minus(low),
      high.minus(this.previousClose).abs(),
      low.minus(this.previousClose).abs(),
    );
    const up = high.minus(this.previousHigh);
    const down = this.previousLow.minus(low);
    const plusDm = up.gt(down) && up.gt(0) ? up : new Decimal(0);
    const minusDm = down.gt(up) && down.gt(0) ? down : new Decimal(0);

    if (this.trSeed.length < this.indicatorPeriod) {
      this.trSeed.push(trueRange);
      this.plusDmSeed.push(plusDm);
      this.minusDmSeed.push(minusDm);
      if (this.trSeed.length === this.indicatorPeriod) {
        this.atr = Decimal.sum(...this.trSeed).div(this.indicatorPeriod);
        this.plusDm = Decimal.sum(...this.plusDmSeed).div(this.indicatorPeriod);
        this.minusDm = Decimal.sum(...this.minusDmSeed).div(
          this.indicatorPeriod,
        );
        this.updateAdx();
      }
    } else {
      const weight = this.indicatorPeriod - 1;
      this.atr = this.atr!.mul(weight)
        .plus(trueRange)
        .div(this.indicatorPeriod);
      this.plusDm = this.plusDm!.mul(weight)
        .plus(plusDm)
        .div(this.indicatorPeriod);
      this.minusDm = this.minusDm!.mul(weight)
        .plus(minusDm)
        .div(this.indicatorPeriod);
      this.updateAdx();
    }

    this.previousHigh = high;
    this.previousLow = low;
    this.previousClose = close;
  }

  private updateAdx() {
    const plusDi = this.plusDm!.div(this.atr!).mul(100);
    const minusDi = this.minusDm!.div(this.atr!).mul(100);
    const total = plusDi.plus(minusDi);
    const dx = total.isZero()
      ? new Decimal(0)
      : plusDi.minus(minusDi).abs().div(total).mul(100);
    if (this.adx) {
      this.adx = this.adx
        .mul(this.indicatorPeriod - 1)
        .plus(dx)
        .div(this.indicatorPeriod);
      return;
    }
    this.dxSeed.push(dx);
    if (this.dxSeed.length === this.indicatorPeriod) {
      this.adx = Decimal.sum(...this.dxSeed).div(this.indicatorPeriod);
    }
  }
}
