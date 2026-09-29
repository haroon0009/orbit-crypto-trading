import { Decimal } from "decimal.js";

import type { Direction } from "../domain/trading.js";

export type PositionSizing =
  | { type: "FIXED_AMOUNT"; amount: string }
  | { type: "PERCENT_OF_ALLOCATION"; percent: string }
  | { type: "RISK_PERCENTAGE"; percent: string };

export interface InstrumentRules {
  tickSize: string;
  quantityStep: string;
  minQuantity: string;
  minNotional: string;
  maxLeverage: string;
}

export interface RiskPolicy {
  maxLeverage: string;
  maxNotional: string;
  maxOpenPositions: number;
  maxDailyLoss: string;
}

export interface RiskRequest {
  timestamp: number;
  direction: Direction;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  leverage: string;
  feeRate: string;
  allocatedCapital: string;
  availableCapital: string;
  currentNotional: string;
  openPositions: number;
  dailyRealizedPnl: string;
  sizing: PositionSizing;
  instrument: InstrumentRules;
  policy: RiskPolicy;
}

export type RiskReason =
  | "ACCEPTED"
  | "INVALID_STOP_LOSS"
  | "INVALID_TAKE_PROFIT"
  | "MAX_DAILY_LOSS_REACHED"
  | "MAX_POSITION_LIMIT"
  | "MAX_LEVERAGE_EXCEEDED"
  | "MAX_NOTIONAL_EXCEEDED"
  | "INSUFFICIENT_ALLOCATION"
  | "MIN_QUANTITY_FAILED"
  | "MIN_NOTIONAL_FAILED"
  | "INVALID_CONFIGURATION";

export interface RiskDecision {
  request: RiskRequest;
  accepted: boolean;
  reason: RiskReason;
  quantity?: string;
  notional?: string;
  margin?: string;
  capitalRequired?: string;
  stopLoss?: string;
  takeProfit?: string;
}

function reject(request: RiskRequest, reason: RiskReason): RiskDecision {
  return { request, accepted: false, reason };
}

function toStep(value: Decimal, step: Decimal, rounding: Decimal.Rounding) {
  return value.div(step).toDecimalPlaces(0, rounding).mul(step);
}

export function evaluateRisk(request: RiskRequest): RiskDecision {
  const entry = new Decimal(request.entryPrice);
  const rawStop = new Decimal(request.stopLoss);
  const rawTarget = new Decimal(request.takeProfit);
  const leverage = new Decimal(request.leverage);
  const feeRate = new Decimal(request.feeRate);
  const allocation = new Decimal(request.allocatedCapital);
  const requestedAvailable = new Decimal(request.availableCapital);
  const tick = new Decimal(request.instrument.tickSize);
  const quantityStep = new Decimal(request.instrument.quantityStep);
  const configurationValues = [
    entry,
    rawStop,
    rawTarget,
    leverage,
    feeRate,
    allocation,
    requestedAvailable,
    tick,
    quantityStep,
    new Decimal(request.instrument.minQuantity),
    new Decimal(request.instrument.minNotional),
    new Decimal(request.instrument.maxLeverage),
    new Decimal(request.policy.maxLeverage),
    new Decimal(request.policy.maxNotional),
    new Decimal(request.policy.maxDailyLoss),
    new Decimal(request.currentNotional),
    new Decimal(request.dailyRealizedPnl),
  ];
  if (
    !configurationValues.every((value) => value.isFinite()) ||
    tick.lte(0) ||
    quantityStep.lte(0) ||
    leverage.lte(0) ||
    feeRate.lt(0) ||
    feeRate.gt(1) ||
    allocation.lte(0) ||
    requestedAvailable.lt(0) ||
    request.openPositions < 0 ||
    request.policy.maxOpenPositions < 1 ||
    new Decimal(request.policy.maxDailyLoss).lt(0)
  ) {
    return reject(request, "INVALID_CONFIGURATION");
  }
  const available = Decimal.max(0, requestedAvailable);
  const stop = toStep(
    rawStop,
    tick,
    request.direction === "LONG" ? Decimal.ROUND_CEIL : Decimal.ROUND_FLOOR,
  );
  const target = toStep(
    rawTarget,
    tick,
    request.direction === "LONG" ? Decimal.ROUND_FLOOR : Decimal.ROUND_CEIL,
  );

  if (
    entry.lte(0) ||
    (request.direction === "LONG" ? stop.gte(entry) : stop.lte(entry))
  ) {
    return reject(request, "INVALID_STOP_LOSS");
  }
  if (request.direction === "LONG" ? target.lte(entry) : target.gte(entry)) {
    return reject(request, "INVALID_TAKE_PROFIT");
  }
  if (
    new Decimal(request.dailyRealizedPnl).lte(
      new Decimal(request.policy.maxDailyLoss).negated(),
    )
  ) {
    return reject(request, "MAX_DAILY_LOSS_REACHED");
  }
  if (request.openPositions >= request.policy.maxOpenPositions) {
    return reject(request, "MAX_POSITION_LIMIT");
  }
  if (
    leverage.gt(request.policy.maxLeverage) ||
    leverage.gt(request.instrument.maxLeverage)
  ) {
    return reject(request, "MAX_LEVERAGE_EXCEEDED");
  }
  if (available.lte(0) || new Decimal(request.currentNotional).lt(0)) {
    return reject(request, "INSUFFICIENT_ALLOCATION");
  }

  const desiredQuantity = (() => {
    switch (request.sizing.type) {
      case "FIXED_AMOUNT":
        return new Decimal(request.sizing.amount).mul(leverage).div(entry);
      case "PERCENT_OF_ALLOCATION":
        return allocation
          .mul(request.sizing.percent)
          .div(100)
          .mul(leverage)
          .div(entry);
      case "RISK_PERCENTAGE":
        return allocation
          .mul(request.sizing.percent)
          .div(100)
          .div(entry.minus(stop).abs());
    }
  })();
  const capitalPerUnit = entry.div(leverage).plus(entry.mul(feeRate).mul(2));
  if (!desiredQuantity.isFinite() || desiredQuantity.lte(0)) {
    return reject(request, "INVALID_CONFIGURATION");
  }
  const maximumQuantity = available.div(capitalPerUnit);
  const quantity = toStep(
    Decimal.min(desiredQuantity, maximumQuantity),
    quantityStep,
    Decimal.ROUND_FLOOR,
  );
  if (quantity.lt(request.instrument.minQuantity) || quantity.lte(0)) {
    return reject(request, "MIN_QUANTITY_FAILED");
  }

  const notional = quantity.mul(entry);
  if (notional.lt(request.instrument.minNotional)) {
    return reject(request, "MIN_NOTIONAL_FAILED");
  }
  if (notional.plus(request.currentNotional).gt(request.policy.maxNotional)) {
    return reject(request, "MAX_NOTIONAL_EXCEEDED");
  }
  const margin = notional.div(leverage);
  const capitalRequired = margin.plus(notional.mul(feeRate).mul(2));
  if (capitalRequired.gt(available)) {
    return reject(request, "INSUFFICIENT_ALLOCATION");
  }

  return {
    request,
    accepted: true,
    reason: "ACCEPTED",
    quantity: quantity.toString(),
    notional: notional.toString(),
    margin: margin.toString(),
    capitalRequired: capitalRequired.toString(),
    stopLoss: stop.toString(),
    takeProfit: target.toString(),
  };
}
