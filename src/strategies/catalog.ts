import { BollingerRsiMeanReversionStrategy } from "./bollinger-rsi-mean-reversion.js";
import { BollingerSqueezeBreakoutStrategy } from "./bollinger-squeeze-breakout.js";
import { DonchianAtrStrategy } from "./donchian-atr.js";
import { EmaAdxAtrStrategy } from "./ema-adx-atr.js";
import { EmaCrossStrategy } from "./ema-cross.js";
import { HtfTrendPullbackStrategy } from "./htf-trend-pullback.js";
import type { Strategy } from "./strategy.js";

interface StrategyVersionInput {
  strategyId: string;
  strategyVersion: string;
  configuration: Record<string, unknown>;
  stopLossPercent: string;
  takeProfitPercent: string;
}

export function createStrategyVersion(input: StrategyVersionInput): Strategy {
  const key = `${input.strategyId}:${input.strategyVersion}`;
  if (key === "EMA_CROSS:1.0.0") {
    return new EmaCrossStrategy(
      Number(input.configuration.fastPeriod ?? 20),
      Number(input.configuration.slowPeriod ?? 50),
      input.stopLossPercent,
      input.takeProfitPercent,
    );
  }
  if (key === "EMA_ADX_ATR:1.0.0") {
    return new EmaAdxAtrStrategy({
      fastPeriod: Number(input.configuration.fastPeriod ?? 20),
      slowPeriod: Number(input.configuration.slowPeriod ?? 50),
      indicatorPeriod: Number(input.configuration.indicatorPeriod ?? 14),
      minimumAdx: String(input.configuration.minimumAdx ?? "25"),
      atrMultiplier: String(input.configuration.atrMultiplier ?? "1.5"),
      rewardRisk: String(input.configuration.rewardRisk ?? "2"),
      confirmationBars: Number(input.configuration.confirmationBars ?? 3),
    });
  }
  if (key === "DONCHIAN_ATR:1.0.0") {
    return new DonchianAtrStrategy({
      channelPeriod: Number(input.configuration.channelPeriod ?? 20),
      atrPeriod: Number(input.configuration.atrPeriod ?? 14),
      atrMultiplier: String(input.configuration.atrMultiplier ?? "2.5"),
      rewardRisk: String(input.configuration.rewardRisk ?? "10"),
    });
  }
  if (key === "BB_RSI_MEAN_REVERSION:1.0.0") {
    return new BollingerRsiMeanReversionStrategy({
      bollingerPeriod: Number(input.configuration.bollingerPeriod ?? 20),
      bollingerDeviation: String(input.configuration.bollingerDeviation ?? "2"),
      rsiPeriod: Number(input.configuration.rsiPeriod ?? 14),
      rsiOversold: String(input.configuration.rsiOversold ?? "30"),
      rsiOverbought: String(input.configuration.rsiOverbought ?? "70"),
      adxPeriod: Number(input.configuration.adxPeriod ?? 14),
      maxAdx: String(input.configuration.maxAdx ?? "20"),
      atrMultiplier: String(input.configuration.atrMultiplier ?? "1"),
    });
  }
  if (key === "BB_SQUEEZE_BREAKOUT:1.0.0") {
    return new BollingerSqueezeBreakoutStrategy({
      bollingerPeriod: Number(input.configuration.bollingerPeriod ?? 20),
      bollingerDeviation: String(input.configuration.bollingerDeviation ?? "2"),
      squeezeLookback: Number(input.configuration.squeezeLookback ?? 100),
      squeezePercentile: Number(input.configuration.squeezePercentile ?? 20),
      atrPeriod: Number(input.configuration.atrPeriod ?? 14),
      atrExpansion: String(input.configuration.atrExpansion ?? "1.2"),
      stopAtrMultiplier: String(input.configuration.stopAtrMultiplier ?? "1.5"),
      trailAtrMultiplier: String(input.configuration.trailAtrMultiplier ?? "2"),
      rewardRisk: String(input.configuration.rewardRisk ?? "10"),
    });
  }
  if (key === "HTF_TREND_PULLBACK:1.0.0") {
    return new HtfTrendPullbackStrategy({
      higherTimeframeMinutes: Number(
        input.configuration.higherTimeframeMinutes ?? 240,
      ),
      higherFastPeriod: Number(input.configuration.higherFastPeriod ?? 20),
      higherSlowPeriod: Number(input.configuration.higherSlowPeriod ?? 50),
      entryEmaPeriod: Number(input.configuration.entryEmaPeriod ?? 20),
      atrPeriod: Number(input.configuration.atrPeriod ?? 14),
      confirmationBars: Number(input.configuration.confirmationBars ?? 3),
      atrMultiplier: String(input.configuration.atrMultiplier ?? "1.5"),
      structureBufferAtr: String(
        input.configuration.structureBufferAtr ?? "0.25",
      ),
      rewardRisk: String(input.configuration.rewardRisk ?? "2"),
    });
  }
  throw new Error("Unsupported strategy version");
}
