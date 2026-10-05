import { Decimal } from "decimal.js";

import type { Position, Signal } from "../domain/trading.js";
import type { Candle } from "../market-data/candle.js";
import type { Strategy, StrategyContext } from "./strategy.js";

export interface BollingerSqueezeBreakoutConfig {
  bollingerPeriod?: number;
  bollingerDeviation?: string;
  squeezeLookback?: number;
  squeezePercentile?: number;
  atrPeriod?: number;
  atrExpansion?: string;
  stopAtrMultiplier?: string;
  trailAtrMultiplier?: string;
  rewardRisk?: string;
}

export class BollingerSqueezeBreakoutStrategy implements Strategy {
  readonly id = "BB_SQUEEZE_BREAKOUT";
  readonly version = "1.0.0";
  private readonly bollingerPeriod: number;
  private readonly deviation: Decimal;
  private readonly squeezeLookback: number;
  private readonly squeezePercentile: number;
  private readonly atrPeriod: number;
  private readonly atrExpansion: Decimal;
  private readonly stopAtrMultiplier: Decimal;
  private readonly trailAtrMultiplier: Decimal;
  private readonly rewardRisk: Decimal;
  private readonly closes: Decimal[] = [];
  private readonly widths: Decimal[] = [];
  private readonly trueRanges: Decimal[] = [];
  private previousClose: Decimal | null = null;
  private atr: Decimal | null = null;
  private squeezeHigh: Decimal | null = null;
  private squeezeLow: Decimal | null = null;
  private activeDirection: Position["direction"] | null = null;
  private extreme: Decimal | null = null;
  private trail: Decimal | null = null;

  constructor(config: BollingerSqueezeBreakoutConfig = {}) {
    this.bollingerPeriod = config.bollingerPeriod ?? 20;
    this.deviation = new Decimal(config.bollingerDeviation ?? "2");
    this.squeezeLookback = config.squeezeLookback ?? 100;
    this.squeezePercentile = config.squeezePercentile ?? 20;
    this.atrPeriod = config.atrPeriod ?? 14;
    this.atrExpansion = new Decimal(config.atrExpansion ?? "1.2");
    this.stopAtrMultiplier = new Decimal(config.stopAtrMultiplier ?? "1.5");
    this.trailAtrMultiplier = new Decimal(config.trailAtrMultiplier ?? "2");
    this.rewardRisk = new Decimal(config.rewardRisk ?? "10");
    if (
      !Number.isInteger(this.bollingerPeriod) ||
      this.bollingerPeriod < 2 ||
      !Number.isInteger(this.squeezeLookback) ||
      this.squeezeLookback < 2 ||
      !Number.isInteger(this.atrPeriod) ||
      this.atrPeriod < 2
    ) {
      throw new Error("Invalid squeeze period");
    }
    if (
      this.deviation.lte(0) ||
      this.squeezePercentile <= 0 ||
      this.squeezePercentile > 100 ||
      this.atrExpansion.lte(0) ||
      this.stopAtrMultiplier.lte(0) ||
      this.trailAtrMultiplier.lte(0) ||
      this.rewardRisk.lte(0)
    ) {
      throw new Error("Invalid squeeze thresholds");
    }
  }

  onCandle(candle: Readonly<Candle>, context: StrategyContext): Signal | null {
    const high = new Decimal(candle.high);
    const low = new Decimal(candle.low);
    const close = new Decimal(candle.close);
    const bands = this.bands();
    const baselineAtr = this.atr;
    const trueRange = this.trueRange(high, low);
    this.updateAtr(trueRange, close);

    let signal: Signal | null = null;
    if (context.position) {
      this.updateTrail(context.position, high, low);
    } else {
      this.activeDirection = null;
      this.extreme = null;
      this.trail = null;
      const expanded =
        baselineAtr &&
        trueRange &&
        trueRange.gte(baselineAtr.mul(this.atrExpansion));
      if (expanded && this.squeezeHigh && close.gt(this.squeezeHigh)) {
        signal = this.createSignal("LONG", close, candle.openTime);
      } else if (expanded && this.squeezeLow && close.lt(this.squeezeLow)) {
        signal = this.createSignal("SHORT", close, candle.openTime);
      }
    }

    this.updateSqueeze(bands, high, low);
    this.closes.push(close);
    if (this.closes.length > this.bollingerPeriod) this.closes.shift();
    return signal;
  }

  trailingStop(position: Readonly<Position>): string | null {
    return this.activeDirection === position.direction
      ? (this.trail?.toString() ?? null)
      : null;
  }

  private bands() {
    if (this.closes.length !== this.bollingerPeriod) return null;
    const middle = Decimal.sum(...this.closes).div(this.bollingerPeriod);
    const variance = Decimal.sum(
      ...this.closes.map((close) => close.minus(middle).pow(2)),
    ).div(this.bollingerPeriod);
    const offset = variance.sqrt().mul(this.deviation);
    return {
      middle,
      upper: middle.plus(offset),
      lower: middle.minus(offset),
    };
  }

  private updateSqueeze(
    bands: ReturnType<BollingerSqueezeBreakoutStrategy["bands"]>,
    high: Decimal,
    low: Decimal,
  ) {
    if (!bands || bands.middle.isZero()) return;
    const width = bands.upper.minus(bands.lower).div(bands.middle).mul(100);
    this.widths.push(width);
    if (this.widths.length > this.squeezeLookback) this.widths.shift();
    if (this.widths.length < this.squeezeLookback) return;
    const sorted = [...this.widths].sort((left, right) =>
      left.comparedTo(right),
    );
    const rank = Math.max(
      0,
      Math.ceil((this.squeezePercentile / 100) * sorted.length) - 1,
    );
    if (width.lte(sorted[rank]!)) {
      this.squeezeHigh = this.squeezeHigh
        ? Decimal.max(this.squeezeHigh, high)
        : high;
      this.squeezeLow = this.squeezeLow
        ? Decimal.min(this.squeezeLow, low)
        : low;
    } else {
      this.squeezeHigh = null;
      this.squeezeLow = null;
    }
  }

  private trueRange(high: Decimal, low: Decimal) {
    if (!this.previousClose) return null;
    return Decimal.max(
      high.minus(low),
      high.minus(this.previousClose).abs(),
      low.minus(this.previousClose).abs(),
    );
  }

  private updateAtr(trueRange: Decimal | null, close: Decimal) {
    this.previousClose = close;
    if (!trueRange) return;
    if (this.trueRanges.length < this.atrPeriod) {
      this.trueRanges.push(trueRange);
      if (this.trueRanges.length === this.atrPeriod) {
        this.atr = Decimal.sum(...this.trueRanges).div(this.atrPeriod);
      }
      return;
    }
    this.atr = this.atr!.mul(this.atrPeriod - 1)
      .plus(trueRange)
      .div(this.atrPeriod);
  }

  private createSignal(
    direction: Position["direction"],
    close: Decimal,
    generatedAt: number,
  ): Signal | null {
    if (!this.atr) return null;
    const risk = this.atr.mul(this.stopAtrMultiplier);
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

  private updateTrail(
    position: Readonly<Position>,
    high: Decimal,
    low: Decimal,
  ) {
    if (!this.atr) return;
    if (this.activeDirection !== position.direction) {
      this.activeDirection = position.direction;
      this.extreme = position.direction === "LONG" ? high : low;
    } else {
      this.extreme =
        position.direction === "LONG"
          ? Decimal.max(this.extreme!, high)
          : Decimal.min(this.extreme!, low);
    }
    const distance = this.atr.mul(this.trailAtrMultiplier);
    const candidate =
      position.direction === "LONG"
        ? this.extreme!.minus(distance)
        : this.extreme!.plus(distance);
    if (candidate.lte(0)) return;
    this.trail = this.trail
      ? position.direction === "LONG"
        ? Decimal.max(this.trail, candidate)
        : Decimal.min(this.trail, candidate)
      : candidate;
  }
}
