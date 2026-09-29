import { createHash, randomUUID } from "node:crypto";

import { Decimal } from "decimal.js";

import type {
  Account,
  Direction,
  ExitReason,
  Fill,
  Order,
  Position,
  Side,
  Signal,
  Trade,
} from "../domain/trading.js";
import type { Candle, CandleInterval } from "../market-data/candle.js";
import type { Strategy } from "../strategies/strategy.js";
import {
  evaluateRisk,
  type InstrumentRules,
  type PositionSizing,
  type RiskDecision,
  type RiskPolicy,
} from "../risk/risk.js";
import { SimulationClock } from "./clock.js";
import { calculateMetrics, type BacktestMetrics } from "./metrics.js";

export interface BacktestConfig {
  startingBalance: string;
  feeRate: string;
  slippageBps: string;
  closeOpenPositionAtEnd: boolean;
  risk: {
    allocation: string;
    leverage: string;
    sizing: PositionSizing;
    instrument: InstrumentRules;
    policy: RiskPolicy;
  };
}

export interface EquityPoint {
  timestamp: number;
  balance: string;
  equity: string;
  drawdown: string;
  drawdownPercent: string;
}

export interface BacktestResult {
  runId: string;
  strategyId: string;
  strategyVersion: string;
  symbol: string;
  interval: CandleInterval;
  startTime: number;
  endTime: number;
  candleCount: number;
  datasetHash: string;
  config: BacktestConfig;
  trades: Trade[];
  equity: EquityPoint[];
  metrics: BacktestMetrics;
  riskDecisions: RiskDecision[];
}

export interface BacktestInput {
  candles: Candle[];
  strategy: Strategy;
  symbol: string;
  interval: CandleInterval;
  config: BacktestConfig;
  clock?: SimulationClock;
}

interface PendingEntry {
  order: Order;
  signal: Signal;
}

function adversePrice(price: Decimal, side: Side, slippageBps: Decimal) {
  const adjustment = slippageBps.div(10_000);
  return side === "BUY"
    ? price.mul(new Decimal(1).plus(adjustment))
    : price.mul(new Decimal(1).minus(adjustment));
}

function fee(price: Decimal, quantity: Decimal, rate: Decimal) {
  return price.mul(quantity).abs().mul(rate);
}

function markEquity(
  balance: Decimal,
  position: Position | null,
  close: string,
  quantity: Decimal,
) {
  if (!position) return balance;
  const unrealized =
    position.direction === "LONG"
      ? new Decimal(close).minus(position.entry.price).mul(quantity)
      : new Decimal(position.entry.price).minus(close).mul(quantity);
  return balance.plus(unrealized);
}

function sideFor(direction: Direction, closing = false): Side {
  if (direction === "LONG") return closing ? "SELL" : "BUY";
  return closing ? "BUY" : "SELL";
}

function validateConfig(config: BacktestConfig): void {
  if (new Decimal(config.startingBalance).lte(0)) {
    throw new Error("Starting balance must be positive");
  }
  if (new Decimal(config.risk.allocation).lte(0))
    throw new Error("Allocation must be positive");
  const feeRate = new Decimal(config.feeRate);
  const slippageBps = new Decimal(config.slippageBps);
  if (feeRate.lt(0) || feeRate.gt(1)) throw new Error("Invalid fee rate");
  if (slippageBps.lt(0) || slippageBps.gte(10_000)) {
    throw new Error("Invalid slippage");
  }
}

function datasetHash(candles: Candle[]): string {
  const hash = createHash("sha256");
  for (const candle of candles) {
    hash.update(
      `${candle.openTime}|${candle.open}|${candle.high}|${candle.low}|${candle.close}|${candle.volume}|${candle.turnover}\n`,
    );
  }
  return hash.digest("hex");
}

export function runBacktest(input: BacktestInput): BacktestResult {
  if (input.candles.length === 0) throw new Error("No candles to backtest");
  validateConfig(input.config);

  const clock = input.clock ?? new SimulationClock();
  const feeRate = new Decimal(input.config.feeRate);
  const slippageBps = new Decimal(input.config.slippageBps);
  let balance = new Decimal(input.config.startingBalance);
  let peakEquity = balance;
  let maxDrawdown = new Decimal(0);
  let maxDrawdownPercent = new Decimal(0);
  let pending: PendingEntry | null = null;
  let position: Position | null = null;
  let reservedCapital = new Decimal(0);
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const riskDecisions: RiskDecision[] = [];
  const dailyPnl = new Map<string, Decimal>();

  const openPosition = (
    candle: Candle,
    entry: PendingEntry,
  ): Position | null => {
    const side = sideFor(entry.signal.direction);
    const price = adversePrice(new Decimal(candle.open), side, slippageBps);
    const day = new Date(candle.openTime).toISOString().slice(0, 10);
    const decision = evaluateRisk({
      timestamp: candle.openTime,
      direction: entry.signal.direction,
      entryPrice: price.toString(),
      stopLoss: entry.signal.stopLoss,
      takeProfit: entry.signal.takeProfit,
      leverage: input.config.risk.leverage,
      feeRate: input.config.feeRate,
      allocatedCapital: input.config.risk.allocation,
      availableCapital: Decimal.min(input.config.risk.allocation, balance)
        .minus(reservedCapital)
        .toString(),
      currentNotional: "0",
      openPositions: 0,
      dailyRealizedPnl: dailyPnl.get(day)?.toString() ?? "0",
      sizing: input.config.risk.sizing,
      instrument: input.config.risk.instrument,
      policy: input.config.risk.policy,
    });
    riskDecisions.push(decision);
    if (
      !decision.accepted ||
      !decision.quantity ||
      !decision.capitalRequired ||
      !decision.stopLoss ||
      !decision.takeProfit
    ) {
      return null;
    }
    const quantity = new Decimal(decision.quantity);
    const stop = new Decimal(decision.stopLoss);
    const target = new Decimal(decision.takeProfit);
    const entryFee = fee(price, quantity, feeRate);
    balance = balance.minus(entryFee);
    reservedCapital = reservedCapital.plus(decision.capitalRequired);

    return {
      direction: entry.signal.direction,
      quantity: quantity.toString(),
      entry: {
        orderId: entry.order.id,
        side,
        price: price.toString(),
        quantity: quantity.toString(),
        fee: entryFee.toString(),
        timestamp: candle.openTime,
      },
      stopLoss: stop.toString(),
      takeProfit: target.toString(),
      reservedCapital: decision.capitalRequired,
    };
  };

  const closePosition = (
    current: Position,
    price: Decimal,
    timestamp: number,
    reason: ExitReason,
    type: Order["type"],
  ): Trade => {
    const side = sideFor(current.direction, true);
    const quantity = new Decimal(current.quantity);
    const exitFee = fee(price, quantity, feeRate);
    const entryPrice = new Decimal(current.entry.price);
    const grossPnl =
      current.direction === "LONG"
        ? price.minus(entryPrice).mul(quantity)
        : entryPrice.minus(price).mul(quantity);
    balance = balance.plus(grossPnl).minus(exitFee);
    reservedCapital = reservedCapital.minus(current.reservedCapital);
    const exit: Fill = {
      orderId: `${timestamp}-${type}-${side}`,
      side,
      price: price.toString(),
      quantity: quantity.toString(),
      fee: exitFee.toString(),
      timestamp,
    };
    const fees = new Decimal(current.entry.fee).plus(exitFee);

    const trade: Trade = {
      direction: current.direction,
      quantity: current.quantity,
      entry: current.entry,
      exit,
      stopLoss: current.stopLoss,
      takeProfit: current.takeProfit,
      grossPnl: grossPnl.toString(),
      fees: fees.toString(),
      netPnl: grossPnl.minus(fees).toString(),
      exitReason: reason,
    };
    const day = new Date(timestamp).toISOString().slice(0, 10);
    dailyPnl.set(day, (dailyPnl.get(day) ?? new Decimal(0)).plus(trade.netPnl));
    return trade;
  };

  for (let index = 0; index < input.candles.length; index++) {
    const candle = input.candles[index];
    if (!candle) continue;
    clock.advance(candle.openTime);

    if (pending && !position) {
      position = openPosition(candle, pending);
      pending = null;
    }

    if (position) {
      const stop = new Decimal(position.stopLoss);
      const target = new Decimal(position.takeProfit);
      const open = new Decimal(candle.open);
      const high = new Decimal(candle.high);
      const low = new Decimal(candle.low);
      const stopHit =
        position.direction === "LONG" ? low.lte(stop) : high.gte(stop);
      const targetHit =
        position.direction === "LONG" ? high.gte(target) : low.lte(target);

      if (stopHit) {
        const stopPrice =
          position.direction === "LONG"
            ? Decimal.min(open, stop)
            : Decimal.max(open, stop);
        const exitPrice = adversePrice(
          stopPrice,
          sideFor(position.direction, true),
          slippageBps,
        );
        trades.push(
          closePosition(
            position,
            exitPrice,
            candle.openTime,
            "STOP_LOSS",
            "STOP_MARKET",
          ),
        );
        position = null;
      } else if (targetHit) {
        trades.push(
          closePosition(
            position,
            target,
            candle.openTime,
            "TAKE_PROFIT",
            "TAKE_PROFIT",
          ),
        );
        position = null;
      }
    }

    if (index < input.candles.length - 1) {
      const account: Account = {
        balance: balance.toString(),
        equity: markEquity(
          balance,
          position,
          candle.close,
          new Decimal(position?.quantity ?? 0),
        ).toString(),
      };
      const signal = input.strategy.onCandle(candle, { account, position });
      if (signal && !position && !pending) {
        if (signal.generatedAt !== candle.openTime) {
          throw new Error("Signal timestamp must equal its candle timestamp");
        }
        pending = {
          signal,
          order: {
            id: `${candle.openTime}-ENTRY-${sideFor(signal.direction)}`,
            side: sideFor(signal.direction),
            type: "MARKET",
            createdAt: candle.openTime,
          },
        };
      }
    }

    if (
      index === input.candles.length - 1 &&
      position &&
      input.config.closeOpenPositionAtEnd
    ) {
      const side = sideFor(position.direction, true);
      const exitPrice = adversePrice(
        new Decimal(candle.close),
        side,
        slippageBps,
      );
      trades.push(
        closePosition(
          position,
          exitPrice,
          candle.openTime,
          "END_OF_DATA",
          "MARKET",
        ),
      );
      position = null;
    }

    const currentEquity = markEquity(
      balance,
      position,
      candle.close,
      new Decimal(position?.quantity ?? 0),
    );
    peakEquity = Decimal.max(peakEquity, currentEquity);
    const drawdown = peakEquity.minus(currentEquity);
    const drawdownPercent = peakEquity.isZero()
      ? new Decimal(0)
      : drawdown.div(peakEquity).mul(100);
    maxDrawdown = Decimal.max(maxDrawdown, drawdown);
    maxDrawdownPercent = Decimal.max(maxDrawdownPercent, drawdownPercent);
    equity.push({
      timestamp: clock.now(),
      balance: balance.toString(),
      equity: currentEquity.toString(),
      drawdown: drawdown.toString(),
      drawdownPercent: drawdownPercent.toString(),
    });
  }

  const first = input.candles[0];
  const last = input.candles.at(-1);
  if (!first || !last) throw new Error("No candles to backtest");
  const metrics = calculateMetrics(
    trades,
    input.config.startingBalance,
    balance.toString(),
    maxDrawdown.toString(),
    maxDrawdownPercent.toString(),
  );

  return {
    runId: randomUUID(),
    strategyId: input.strategy.id,
    strategyVersion: input.strategy.version,
    symbol: input.symbol,
    interval: input.interval,
    startTime: first.openTime,
    endTime: last.openTime,
    candleCount: input.candles.length,
    datasetHash: datasetHash(input.candles),
    config: input.config,
    trades,
    equity,
    metrics,
    riskDecisions,
  };
}
