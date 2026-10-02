import { Decimal } from "decimal.js";

import type {
  Direction,
  ExitReason,
  Order,
  Position,
  Side,
  Trade,
} from "../domain/trading.js";
import type { Candle } from "../market-data/candle.js";

export function adversePrice(
  price: Decimal,
  side: Side,
  slippageBps: Decimal,
): Decimal {
  const adjustment = slippageBps.div(10_000);
  return side === "BUY"
    ? price.mul(new Decimal(1).plus(adjustment))
    : price.mul(new Decimal(1).minus(adjustment));
}

export function fee(price: Decimal, quantity: Decimal, rate: Decimal): Decimal {
  return price.mul(quantity).abs().mul(rate);
}

export function markEquity(
  balance: Decimal,
  position: Position | null,
  close: string,
): Decimal {
  if (!position) return balance;
  const quantity = new Decimal(position.quantity);
  const unrealized =
    position.direction === "LONG"
      ? new Decimal(close).minus(position.entry.price).mul(quantity)
      : new Decimal(position.entry.price).minus(close).mul(quantity);
  return balance.plus(unrealized);
}

export function sideFor(direction: Direction, closing = false): Side {
  if (direction === "LONG") return closing ? "SELL" : "BUY";
  return closing ? "BUY" : "SELL";
}

export interface ProtectiveExit {
  price: Decimal;
  reason: ExitReason;
  type: Order["type"];
}

export function protectiveExit(
  position: Position,
  candle: Candle,
  slippageBps: Decimal,
): ProtectiveExit | null {
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
    return {
      price: adversePrice(
        stopPrice,
        sideFor(position.direction, true),
        slippageBps,
      ),
      reason: "STOP_LOSS",
      type: "STOP_MARKET",
    };
  }
  if (targetHit) {
    return { price: target, reason: "TAKE_PROFIT", type: "TAKE_PROFIT" };
  }
  return null;
}

export function simulatedTrade(
  position: Position,
  price: Decimal,
  timestamp: number,
  reason: ExitReason,
  type: Order["type"],
  feeRate: Decimal,
): Trade {
  const quantity = new Decimal(position.quantity);
  const exitFee = fee(price, quantity, feeRate);
  const entryPrice = new Decimal(position.entry.price);
  const grossPnl =
    position.direction === "LONG"
      ? price.minus(entryPrice).mul(quantity)
      : entryPrice.minus(price).mul(quantity);
  const fees = new Decimal(position.entry.fee).plus(exitFee);
  return {
    direction: position.direction,
    quantity: position.quantity,
    entry: position.entry,
    exit: {
      orderId: `${timestamp}-${type}-${sideFor(position.direction, true)}`,
      side: sideFor(position.direction, true),
      price: price.toString(),
      quantity: position.quantity,
      fee: exitFee.toString(),
      timestamp,
    },
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    grossPnl: grossPnl.toString(),
    fees: fees.toString(),
    netPnl: grossPnl.minus(fees).toString(),
    exitReason: reason,
  };
}
