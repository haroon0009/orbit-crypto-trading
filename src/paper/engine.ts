import { Decimal } from "decimal.js";

import type {
  Account,
  Fill,
  Order,
  Position,
  Signal,
  Trade,
} from "../domain/trading.js";
import {
  adversePrice,
  fee,
  markEquity,
  protectiveExit,
  sideFor,
  simulatedTrade,
} from "../execution/simulation.js";
import {
  validateCandle,
  type Candle,
  type CandleInterval,
} from "../market-data/candle.js";
import {
  noNotifications,
  type CriticalNotifier,
} from "../notifications/telegram.js";
import type { CapitalAllocationRepository } from "../persistence/capital.js";
import type {
  PaperOrderChange,
  PaperRepository,
  PaperState,
} from "../persistence/paper.js";
import type {
  InstrumentRules,
  PositionSizing,
  RiskPolicy,
  RiskReason,
} from "../risk/risk.js";
import type { Strategy } from "../strategies/strategy.js";

export interface PaperTradingConfig {
  startingBalance: string;
  feeRate: string;
  slippageBps: string;
  dryRun: boolean;
  risk: {
    allocation: string;
    leverage: string;
    sizing: PositionSizing;
    instrument: InstrumentRules;
    policy: RiskPolicy;
  };
}

export interface PaperTraderInput {
  accountKey: string;
  symbol: string;
  interval: CandleInterval;
  strategy: Strategy;
  config: PaperTradingConfig;
  paperRepository: PaperRepository;
  capitalRepository: CapitalAllocationRepository;
  notifier?: CriticalNotifier;
}

function validateConfig(config: PaperTradingConfig): void {
  const startingBalance = new Decimal(config.startingBalance);
  const feeRate = new Decimal(config.feeRate);
  const slippageBps = new Decimal(config.slippageBps);
  if (!startingBalance.isFinite() || startingBalance.lte(0)) {
    throw new Error("Starting balance must be positive");
  }
  if (!feeRate.isFinite() || feeRate.lt(0) || feeRate.gt(1)) {
    throw new Error("Invalid fee rate");
  }
  if (!slippageBps.isFinite() || slippageBps.lt(0) || slippageBps.gte(10_000)) {
    throw new Error("Invalid slippage");
  }
}

export class PaperTrader {
  private constructor(
    private readonly input: PaperTraderInput,
    private state: PaperState,
  ) {}

  static async create(input: PaperTraderInput): Promise<PaperTrader> {
    validateConfig(input.config);
    await input.capitalRepository.ensure(
      input.accountKey,
      input.config.risk.allocation,
    );
    const state = await input.paperRepository.loadOrCreate(
      input.accountKey,
      input.strategy,
      input.symbol,
      input.interval,
      input.config,
    );
    await input.capitalRepository.reconcile(
      input.accountKey,
      input.config.dryRun ? "0" : (state.position?.reservedCapital ?? "0"),
    );
    return new PaperTrader(input, state);
  }

  snapshot(): Readonly<PaperState> {
    return structuredClone(this.state);
  }

  async onCandle(inputCandle: Candle): Promise<boolean> {
    const candle = validateCandle(inputCandle, this.input.interval);
    if (
      this.state.lastCandleTime !== null &&
      candle.openTime <= this.state.lastCandleTime
    ) {
      return false;
    }

    const feeRate = new Decimal(this.input.config.feeRate);
    const slippage = new Decimal(this.input.config.slippageBps);
    const day = new Date(candle.openTime).toISOString().slice(0, 10);
    let balance = new Decimal(this.state.balance);
    let dailyPnl =
      this.state.dailyPnlDate === day
        ? new Decimal(this.state.dailyRealizedPnl)
        : new Decimal(0);
    let pending = this.state.pending;
    let position = this.state.position;
    let openedPosition: Position | undefined;
    let closedTrade: Trade | undefined;
    let reservedThisCandle: string | undefined;
    let releaseAfterSave: string | undefined;
    const orders: PaperOrderChange[] = [];
    const fills: Fill[] = [];
    const alerts: string[] = [];

    if (pending && !position) {
      const entryPrice = adversePrice(
        new Decimal(candle.open),
        pending.order.side,
        slippage,
      );
      const decisionMethod = this.input.config.dryRun ? "plan" : "reserve";
      const decision = await this.input.capitalRepository[decisionMethod](
        this.input.accountKey,
        {
          timestamp: candle.openTime,
          direction: pending.signal.direction,
          entryPrice: entryPrice.toString(),
          stopLoss: pending.signal.stopLoss,
          takeProfit: pending.signal.takeProfit,
          leverage: this.input.config.risk.leverage,
          feeRate: this.input.config.feeRate,
          availableCapitalLimit: Decimal.min(
            this.input.config.risk.allocation,
            balance,
          ).toString(),
          currentNotional: "0",
          openPositions: 0,
          dailyRealizedPnl: dailyPnl.toString(),
          sizing: this.input.config.risk.sizing,
          instrument: this.input.config.risk.instrument,
          policy: this.input.config.risk.policy,
        },
      );
      if (
        decision.accepted &&
        decision.quantity &&
        decision.capitalRequired &&
        decision.stopLoss &&
        decision.takeProfit
      ) {
        orders.push({
          order: pending.order,
          status: this.input.config.dryRun ? "PLANNED" : "FILLED",
          quantity: decision.quantity,
        });
        if (!this.input.config.dryRun) {
          reservedThisCandle = decision.capitalRequired;
          const entryFee = fee(
            entryPrice,
            new Decimal(decision.quantity),
            feeRate,
          );
          const fill: Fill = {
            orderId: pending.order.id,
            side: pending.order.side,
            price: entryPrice.toString(),
            quantity: decision.quantity,
            fee: entryFee.toString(),
            timestamp: candle.openTime,
          };
          fills.push(fill);
          balance = balance.minus(entryFee);
          position = {
            direction: pending.signal.direction,
            quantity: decision.quantity,
            entry: fill,
            stopLoss: decision.stopLoss,
            takeProfit: decision.takeProfit,
            reservedCapital: decision.capitalRequired,
          };
          openedPosition = position;
        }
      } else {
        orders.push({ order: pending.order, status: "REJECTED" });
        if (this.isCriticalRiskReason(decision.reason)) {
          alerts.push(
            `[PAPER] ${this.input.accountKey} risk rejected: ${decision.reason}`,
          );
        }
      }
      pending = null;
    }

    if (position) {
      const exit = protectiveExit(position, candle, slippage);
      if (exit) {
        const trade = simulatedTrade(
          position,
          exit.price,
          candle.openTime,
          exit.reason,
          exit.type,
          feeRate,
        );
        const exitOrder: Order = {
          id: trade.exit.orderId,
          side: trade.exit.side,
          type: exit.type,
          createdAt: candle.openTime,
          requestedPrice: exit.price.toString(),
        };
        orders.push({
          order: exitOrder,
          status: "FILLED",
          quantity: trade.quantity,
        });
        fills.push(trade.exit);
        balance = balance.plus(trade.grossPnl).minus(trade.exit.fee);
        dailyPnl = dailyPnl.plus(trade.netPnl);
        releaseAfterSave = position.reservedCapital;
        closedTrade = trade;
        position = null;
        if (trade.exitReason === "STOP_LOSS") {
          alerts.push(
            `[PAPER] ${this.input.accountKey} stop-loss: ${trade.netPnl} USDT`,
          );
        }
      }
    }

    const account: Account = {
      balance: balance.toString(),
      equity: markEquity(balance, position, candle.close).toString(),
    };
    if (!position && !pending) {
      const signal = this.input.strategy.onCandle(candle, {
        account,
        position,
      });
      if (signal) {
        this.validateSignal(signal, candle);
        const order: Order = {
          id: `${candle.openTime}-ENTRY-${sideFor(signal.direction)}`,
          side: sideFor(signal.direction),
          type: "MARKET",
          createdAt: candle.openTime,
        };
        pending = { order, signal };
        orders.push({ order, signal, status: "PENDING" });
      }
    }

    const equity = markEquity(balance, position, candle.close).toString();
    try {
      await this.input.paperRepository.saveCandle(this.state.accountId, {
        timestamp: candle.openTime,
        balance: balance.toString(),
        equity,
        dailyRealizedPnl: dailyPnl.toString(),
        dailyPnlDate: day,
        orders,
        fills,
        ...(openedPosition ? { openedPosition } : {}),
        ...(closedTrade ? { closedTrade } : {}),
      });
    } catch (error) {
      if (reservedThisCandle) {
        await this.input.capitalRepository.release(
          this.input.accountKey,
          reservedThisCandle,
        );
      }
      throw error;
    }
    if (releaseAfterSave) {
      await this.input.capitalRepository.release(
        this.input.accountKey,
        releaseAfterSave,
      );
    }

    this.state = {
      ...this.state,
      balance: balance.toString(),
      equity,
      dailyRealizedPnl: dailyPnl.toString(),
      dailyPnlDate: day,
      lastCandleTime: candle.openTime,
      pending,
      position,
    };
    const notifier = this.input.notifier ?? noNotifications;
    await Promise.allSettled(alerts.map((message) => notifier.send(message)));
    return true;
  }

  private validateSignal(signal: Signal, candle: Candle): void {
    if (signal.generatedAt !== candle.openTime) {
      throw new Error("Signal timestamp must equal its candle timestamp");
    }
  }

  private isCriticalRiskReason(reason: RiskReason): boolean {
    return (
      reason === "MAX_DAILY_LOSS_REACHED" ||
      reason === "INSUFFICIENT_ALLOCATION" ||
      reason === "INVALID_CONFIGURATION"
    );
  }
}
