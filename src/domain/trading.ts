export type Direction = "LONG" | "SHORT";
export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "STOP_MARKET" | "TAKE_PROFIT";
export type ExitReason = "STOP_LOSS" | "TAKE_PROFIT" | "END_OF_DATA";

export interface Signal {
  direction: Direction;
  stopLoss: string;
  takeProfit: string;
  generatedAt: number;
}

export interface Order {
  id: string;
  side: Side;
  type: OrderType;
  createdAt: number;
  requestedPrice?: string;
}

export interface Fill {
  orderId: string;
  side: Side;
  price: string;
  quantity: string;
  fee: string;
  timestamp: number;
}

export interface Position {
  direction: Direction;
  quantity: string;
  entry: Fill;
  stopLoss: string;
  takeProfit: string;
  reservedCapital: string;
}

export interface Account {
  balance: string;
  equity: string;
}

export interface Trade {
  direction: Direction;
  quantity: string;
  entry: Fill;
  exit: Fill;
  stopLoss: string;
  takeProfit: string;
  grossPnl: string;
  fees: string;
  netPnl: string;
  exitReason: ExitReason;
}
