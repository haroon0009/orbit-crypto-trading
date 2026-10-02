import type { Side } from "../domain/trading.js";
import type { InstrumentRules } from "../risk/risk.js";

export interface ExchangeOrderRequest {
  symbol: string;
  side: Side;
  type: "MARKET" | "LIMIT";
  quantity: string;
  price?: string;
  reduceOnly?: boolean;
  idempotencyKey: string;
}

export interface ExchangeOrderAcknowledgement {
  exchangeOrderId: string;
  clientOrderId: string;
}

export type ExchangeOrderStatus =
  "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "UNKNOWN";

export interface ExchangeOrderState {
  exchangeOrderId: string;
  clientOrderId: string;
  side: Side;
  status: ExchangeOrderStatus;
  quantity: string;
  filledQuantity: string;
  reduceOnly: boolean;
}

export interface ExchangeFillState {
  executionId: string;
  exchangeOrderId: string;
  clientOrderId: string;
  side: Side;
  price: string;
  quantity: string;
  fee: string;
  timestamp: number;
}

export interface ExchangePositionState {
  direction: "LONG" | "SHORT";
  quantity: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
}

export interface ExchangeSnapshot {
  walletBalance: string;
  orders: ExchangeOrderState[];
  fills: ExchangeFillState[];
  position: ExchangePositionState | null;
}

export interface ExchangeAdapter {
  getInstrumentRules(symbol: string): Promise<InstrumentRules>;
  placeOrder(
    request: ExchangeOrderRequest,
  ): Promise<ExchangeOrderAcknowledgement>;
  getSnapshot(symbol: string): Promise<ExchangeSnapshot>;
  setProtection(
    symbol: string,
    stopLoss: string,
    takeProfit: string,
  ): Promise<void>;
  closePosition(
    symbol: string,
    direction: "LONG" | "SHORT",
    quantity: string,
    idempotencyKey: string,
  ): Promise<ExchangeOrderAcknowledgement>;
}
