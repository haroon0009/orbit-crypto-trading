import { EmaAdxAtrStrategy } from "./ema-adx-atr.js";
import { EmaCrossStrategy } from "./ema-cross.js";
import { DonchianAtrStrategy } from "./donchian-atr.js";
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
  throw new Error("Unsupported strategy version");
}
