import { Decimal } from "decimal.js";

import type { Position, Signal } from "../domain/trading.js";
import type { Candle } from "../market-data/candle.js";
import type { Strategy, StrategyContext } from "./strategy.js";

export interface DonchianAtrConfig {
  channelPeriod?: number;
  atrPeriod?: number;
  atrMultiplier?: string;
  rewardRisk?: string;
}

export class DonchianAtrStrategy implements Strategy {
  readonly id = "DONCHIAN_ATR";
  readonly version = "1.0.0";
  private readonly channelPeriod: number;
  private readonly atrPeriod: number;
  private readonly atrMultiplier: Decimal;
  private readonly rewardRisk: Decimal;
  private readonly highs: Decimal[] = [];
  private readonly lows: Decimal[] = [];
  private readonly trueRanges: Decimal[] = [];
  private previousClose: Decimal | null = null;
  private atr: Decimal | null = null;
  private activeDirection: Position["direction"] | null = null;
  private extreme: Decimal | null = null;
  private trail: Decimal | null = null;

  constructor(config: DonchianAtrConfig = {}) {
    this.channelPeriod = config.channelPeriod ?? 20;
    this.atrPeriod = config.atrPeriod ?? 14;
    this.atrMultiplier = new Decimal(config.atrMultiplier ?? "2.5");
    this.rewardRisk = new Decimal(config.rewardRisk ?? "10");
    if (!Number.isInteger(this.channelPeriod) || this.channelPeriod < 2) {
      throw new Error("Invalid Donchian period");
    }
    if (!Number.isInteger(this.atrPeriod) || this.atrPeriod < 2) {
      throw new Error("Invalid ATR period");
    }
    if (this.atrMultiplier.lte(0) || this.rewardRisk.lte(0)) {
      throw new Error("Invalid Donchian protection");
    }
  }

  onCandle(candle: Readonly<Candle>, context: StrategyContext): Signal | null {
    const high = new Decimal(candle.high);
    const low = new Decimal(candle.low);
    const close = new Decimal(candle.close);
    const channelHigh =
      this.highs.length === this.channelPeriod
        ? Decimal.max(...this.highs)
        : null;
    const channelLow =
      this.lows.length === this.channelPeriod
        ? Decimal.min(...this.lows)
        : null;
    this.updateAtr(high, low, close);

    let signal: Signal | null = null;
    if (context.position) {
      this.updateTrail(context.position, high, low);
    } else {
      this.activeDirection = null;
      this.extreme = null;
      this.trail = null;
      if (this.atr && channelHigh && close.gt(channelHigh)) {
        signal = this.createSignal("LONG", close, candle.openTime);
      } else if (this.atr && channelLow && close.lt(channelLow)) {
        signal = this.createSignal("SHORT", close, candle.openTime);
      }
    }

    this.highs.push(high);
    this.lows.push(low);
    if (this.highs.length > this.channelPeriod) this.highs.shift();
    if (this.lows.length > this.channelPeriod) this.lows.shift();
    return signal;
  }

  trailingStop(position: Readonly<Position>): string | null {
    return this.activeDirection === position.direction
      ? (this.trail?.toString() ?? null)
      : null;
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

  private updateTrail(
    position: Readonly<Position>,
    high: Decimal,
    low: Decimal,
  ) {
    if (!this.atr) return;
    // ponytail: indicators re-warm after restart; persist strategy snapshots before live execution.
    if (this.activeDirection !== position.direction) {
      this.activeDirection = position.direction;
      this.extreme = position.direction === "LONG" ? high : low;
      this.trail = null;
    } else {
      this.extreme =
        position.direction === "LONG"
          ? Decimal.max(this.extreme!, high)
          : Decimal.min(this.extreme!, low);
    }
    const distance = this.atr.mul(this.atrMultiplier);
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

  private createSignal(
    direction: Position["direction"],
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
}
