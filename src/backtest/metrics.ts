import { Decimal } from "decimal.js";

import type { Trade } from "../domain/trading.js";

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: string;
  grossProfit: string;
  grossLoss: string;
  netProfit: string;
  profitFactor: string | null;
  expectancy: string;
  maxDrawdown: string;
  maxDrawdownPercent: string;
  returnPercent: string;
  finalBalance: string;
}

export function calculateMetrics(
  trades: Trade[],
  startingBalance: string,
  finalBalance: string,
  maxDrawdown: string,
  maxDrawdownPercent: string,
): BacktestMetrics {
  const wins = trades.filter((trade) => new Decimal(trade.netPnl).gt(0));
  const losses = trades.filter((trade) => new Decimal(trade.netPnl).lt(0));
  const grossProfit = Decimal.sum(...wins.map((trade) => trade.netPnl), 0);
  const grossLoss = Decimal.sum(
    ...losses.map((trade) => new Decimal(trade.netPnl).abs()),
    0,
  );
  const netProfit = new Decimal(finalBalance).minus(startingBalance);
  const total = trades.length;

  return {
    totalTrades: total,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRatePercent: total
      ? new Decimal(wins.length).div(total).mul(100).toString()
      : "0",
    grossProfit: grossProfit.toString(),
    grossLoss: grossLoss.toString(),
    netProfit: netProfit.toString(),
    profitFactor: grossLoss.isZero()
      ? null
      : grossProfit.div(grossLoss).toString(),
    expectancy: total ? netProfit.div(total).toString() : "0",
    maxDrawdown,
    maxDrawdownPercent,
    returnPercent: new Decimal(startingBalance).isZero()
      ? "0"
      : netProfit.div(startingBalance).mul(100).toString(),
    finalBalance,
  };
}
