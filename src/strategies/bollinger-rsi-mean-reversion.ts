import { Decimal } from "decimal.js";

import type { Signal } from "../domain/trading.js";
import type { Candle } from "../market-data/candle.js";
import type { Strategy, StrategyContext } from "./strategy.js";

export interface BollingerRsiMeanReversionConfig {
  bollingerPeriod?: number;
  bollingerDeviation?: string;
  rsiPeriod?: number;
  rsiOversold?: string;
  rsiOverbought?: string;
  adxPeriod?: number;
  maxAdx?: string;
  atrMultiplier?: string;
}

export class BollingerRsiMeanReversionStrategy implements Strategy {
  readonly id = "BB_RSI_MEAN_REVERSION";
  readonly version = "1.0.0";
  private readonly bollingerPeriod: number;
  private readonly deviation: Decimal;
  private readonly rsiPeriod: number;
  private readonly oversold: Decimal;
  private readonly overbought: Decimal;
  private readonly adxPeriod: number;
  private readonly maxAdx: Decimal;
  private readonly atrMultiplier: Decimal;
  private readonly closes: Decimal[] = [];
  private previousHigh: Decimal | null = null;
  private previousLow: Decimal | null = null;
  private previousClose: Decimal | null = null;
  private atr: Decimal | null = null;
  private plusDm: Decimal | null = null;
  private minusDm: Decimal | null = null;
  private adx: Decimal | null = null;
  private averageGain: Decimal | null = null;
  private averageLoss: Decimal | null = null;
  private rsi: Decimal | null = null;
  private readonly trSeed: Decimal[] = [];
  private readonly plusDmSeed: Decimal[] = [];
  private readonly minusDmSeed: Decimal[] = [];
  private readonly dxSeed: Decimal[] = [];
  private readonly gainSeed: Decimal[] = [];
  private readonly lossSeed: Decimal[] = [];

  constructor(config: BollingerRsiMeanReversionConfig = {}) {
    this.bollingerPeriod = config.bollingerPeriod ?? 20;
    this.deviation = new Decimal(config.bollingerDeviation ?? "2");
    this.rsiPeriod = config.rsiPeriod ?? 14;
    this.oversold = new Decimal(config.rsiOversold ?? "30");
    this.overbought = new Decimal(config.rsiOverbought ?? "70");
    this.adxPeriod = config.adxPeriod ?? 14;
    this.maxAdx = new Decimal(config.maxAdx ?? "20");
    this.atrMultiplier = new Decimal(config.atrMultiplier ?? "1");
    if (!Number.isInteger(this.bollingerPeriod) || this.bollingerPeriod < 2) {
      throw new Error("Invalid Bollinger period");
    }
    if (
      !Number.isInteger(this.rsiPeriod) ||
      this.rsiPeriod < 2 ||
      !Number.isInteger(this.adxPeriod) ||
      this.adxPeriod < 2
    ) {
      throw new Error("Invalid momentum period");
    }
    if (
      this.deviation.lte(0) ||
      this.atrMultiplier.lte(0) ||
      this.maxAdx.lt(0) ||
      this.maxAdx.gt(100) ||
      this.oversold.lt(0) ||
      this.overbought.gt(100) ||
      this.oversold.gte(this.overbought)
    ) {
      throw new Error("Invalid mean-reversion thresholds");
    }
  }

  onCandle(candle: Readonly<Candle>, context: StrategyContext): Signal | null {
    const high = new Decimal(candle.high);
    const low = new Decimal(candle.low);
    const close = new Decimal(candle.close);
    const bands = this.bands();
    this.updateIndicators(high, low, close);
    this.closes.push(close);
    if (this.closes.length > this.bollingerPeriod) this.closes.shift();

    if (
      context.position ||
      !bands ||
      !this.atr ||
      !this.rsi ||
      !this.adx ||
      this.adx.gt(this.maxAdx)
    ) {
      return null;
    }

    const long =
      low.lt(bands.lower) &&
      close.gt(bands.lower) &&
      close.lt(bands.middle) &&
      this.rsi.lte(this.oversold);
    const short =
      high.gt(bands.upper) &&
      close.lt(bands.upper) &&
      close.gt(bands.middle) &&
      this.rsi.gte(this.overbought);
    if (!long && !short) return null;

    const distance = this.atr.mul(this.atrMultiplier);
    const stopLoss = long
      ? Decimal.min(low, bands.lower).minus(distance)
      : Decimal.max(high, bands.upper).plus(distance);
    if (stopLoss.lte(0)) return null;
    return {
      direction: long ? "LONG" : "SHORT",
      stopLoss: stopLoss.toString(),
      takeProfit: bands.middle.toString(),
      generatedAt: candle.openTime,
    };
  }

  private bands() {
    if (this.closes.length !== this.bollingerPeriod) return null;
    const middle = Decimal.sum(...this.closes).div(this.bollingerPeriod);
    const variance = Decimal.sum(
      ...this.closes.map((close) => close.minus(middle).pow(2)),
    ).div(this.bollingerPeriod);
    const width = variance.sqrt().mul(this.deviation);
    return { middle, lower: middle.minus(width), upper: middle.plus(width) };
  }

  private updateIndicators(high: Decimal, low: Decimal, close: Decimal) {
    if (!this.previousHigh || !this.previousLow || !this.previousClose) {
      this.previousHigh = high;
      this.previousLow = low;
      this.previousClose = close;
      return;
    }
    const delta = close.minus(this.previousClose);
    this.updateRsi(Decimal.max(delta, 0), Decimal.max(delta.negated(), 0));
    const trueRange = Decimal.max(
      high.minus(low),
      high.minus(this.previousClose).abs(),
      low.minus(this.previousClose).abs(),
    );
    const up = high.minus(this.previousHigh);
    const down = this.previousLow.minus(low);
    this.updateDirection(
      trueRange,
      up.gt(down) && up.gt(0) ? up : new Decimal(0),
      down.gt(up) && down.gt(0) ? down : new Decimal(0),
    );
    this.previousHigh = high;
    this.previousLow = low;
    this.previousClose = close;
  }

  private updateRsi(gain: Decimal, loss: Decimal) {
    if (this.gainSeed.length < this.rsiPeriod) {
      this.gainSeed.push(gain);
      this.lossSeed.push(loss);
      if (this.gainSeed.length === this.rsiPeriod) {
        this.averageGain = Decimal.sum(...this.gainSeed).div(this.rsiPeriod);
        this.averageLoss = Decimal.sum(...this.lossSeed).div(this.rsiPeriod);
      }
    } else {
      this.averageGain = this.averageGain!.mul(this.rsiPeriod - 1)
        .plus(gain)
        .div(this.rsiPeriod);
      this.averageLoss = this.averageLoss!.mul(this.rsiPeriod - 1)
        .plus(loss)
        .div(this.rsiPeriod);
    }
    if (!this.averageGain || !this.averageLoss) return;
    this.rsi = this.averageLoss.isZero()
      ? this.averageGain.isZero()
        ? new Decimal(50)
        : new Decimal(100)
      : new Decimal(100).minus(
          new Decimal(100).div(
            new Decimal(1).plus(this.averageGain.div(this.averageLoss)),
          ),
        );
  }

  private updateDirection(
    trueRange: Decimal,
    plusDm: Decimal,
    minusDm: Decimal,
  ) {
    if (this.trSeed.length < this.adxPeriod) {
      this.trSeed.push(trueRange);
      this.plusDmSeed.push(plusDm);
      this.minusDmSeed.push(minusDm);
      if (this.trSeed.length !== this.adxPeriod) return;
      this.atr = Decimal.sum(...this.trSeed).div(this.adxPeriod);
      this.plusDm = Decimal.sum(...this.plusDmSeed).div(this.adxPeriod);
      this.minusDm = Decimal.sum(...this.minusDmSeed).div(this.adxPeriod);
    } else {
      const weight = this.adxPeriod - 1;
      this.atr = this.atr!.mul(weight).plus(trueRange).div(this.adxPeriod);
      this.plusDm = this.plusDm!.mul(weight).plus(plusDm).div(this.adxPeriod);
      this.minusDm = this.minusDm!.mul(weight)
        .plus(minusDm)
        .div(this.adxPeriod);
    }
    const plusDi = this.atr.isZero()
      ? new Decimal(0)
      : this.plusDm!.div(this.atr).mul(100);
    const minusDi = this.atr.isZero()
      ? new Decimal(0)
      : this.minusDm!.div(this.atr).mul(100);
    const total = plusDi.plus(minusDi);
    const dx = total.isZero()
      ? new Decimal(0)
      : plusDi.minus(minusDi).abs().div(total).mul(100);
    if (this.adx) {
      this.adx = this.adx
        .mul(this.adxPeriod - 1)
        .plus(dx)
        .div(this.adxPeriod);
    } else {
      this.dxSeed.push(dx);
      if (this.dxSeed.length === this.adxPeriod) {
        this.adx = Decimal.sum(...this.dxSeed).div(this.adxPeriod);
      }
    }
  }
}
