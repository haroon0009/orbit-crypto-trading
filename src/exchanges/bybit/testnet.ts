import { createHash, createHmac } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { Decimal } from "decimal.js";
import { z } from "zod";

import type {
  ExchangeAdapter,
  ExchangeFillState,
  ExchangeOrderAcknowledgement,
  ExchangeOrderRequest,
  ExchangeOrderState,
  ExchangeOrderStatus,
  ExchangePositionState,
  ExchangeSnapshot,
} from "../exchange.js";
import type { InstrumentRules } from "../../risk/risk.js";

const envelopeSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.unknown(),
});
const instrumentSchema = z.object({
  list: z.array(
    z.object({
      symbol: z.string(),
      status: z.string(),
      leverageFilter: z.object({ maxLeverage: z.string() }),
      priceFilter: z.object({ tickSize: z.string() }),
      lotSizeFilter: z.object({
        minOrderQty: z.string(),
        qtyStep: z.string(),
        minNotionalValue: z.string(),
      }),
    }),
  ),
});
const orderSchema = z.object({
  orderId: z.string().min(1),
  orderLinkId: z.string().min(1),
});
const ordersSchema = z.object({
  list: z.array(
    z.object({
      orderId: z.string(),
      orderLinkId: z.string(),
      side: z.enum(["Buy", "Sell"]),
      orderStatus: z.string(),
      qty: z.string(),
      cumExecQty: z.string(),
      reduceOnly: z.boolean(),
    }),
  ),
});
const executionsSchema = z.object({
  list: z.array(
    z.object({
      execId: z.string(),
      orderId: z.string(),
      orderLinkId: z.string(),
      side: z.enum(["Buy", "Sell"]),
      execPrice: z.string(),
      execQty: z.string(),
      execFee: z.string(),
      execTime: z.string(),
    }),
  ),
});
const positionsSchema = z.object({
  list: z.array(
    z.object({
      symbol: z.string(),
      side: z.enum(["Buy", "Sell", ""]),
      size: z.string(),
      avgPrice: z.string().optional(),
      entryPrice: z.string().optional(),
      stopLoss: z.string(),
      takeProfit: z.string(),
      positionIdx: z.number(),
    }),
  ),
});
const walletSchema = z.object({
  list: z.array(z.object({ totalWalletBalance: z.string() })).min(1),
});

export interface BybitCredentials {
  apiKey: string;
  apiSecret: string;
}

export function deterministicClientOrderId(
  request: Pick<ExchangeOrderRequest, "symbol" | "side" | "idempotencyKey">,
): string {
  const digest = createHash("sha256")
    .update(`${request.symbol}|${request.side}|${request.idempotencyKey}`)
    .digest("hex");
  return `bot-${digest.slice(0, 32)}`;
}

export class BybitTestnetAdapter implements ExchangeAdapter {
  private readonly cache = new Map<
    string,
    { expiresAt: number; rules: InstrumentRules }
  >();

  constructor(
    private readonly credentials: BybitCredentials,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly wait: (milliseconds: number) => Promise<unknown> = sleep,
    private readonly instrumentCacheMs = 5 * 60_000,
  ) {
    if (!credentials.apiKey || !credentials.apiSecret) {
      throw new Error("Bybit testnet credentials are required");
    }
  }

  async getInstrumentRules(symbol: string): Promise<InstrumentRules> {
    this.validateSymbol(symbol);
    const cached = this.cache.get(symbol);
    if (cached && cached.expiresAt > this.now()) return cached.rules;

    const query = new URLSearchParams({ category: "linear", symbol });
    const result = instrumentSchema.parse(
      await this.request(`/v5/market/instruments-info?${query}`, "GET"),
    );
    const instrument = result.list.find((item) => item.symbol === symbol);
    if (!instrument || instrument.status !== "Trading") {
      throw new Error(`Bybit testnet instrument is not trading: ${symbol}`);
    }
    const rules: InstrumentRules = {
      tickSize: instrument.priceFilter.tickSize,
      quantityStep: instrument.lotSizeFilter.qtyStep,
      minQuantity: instrument.lotSizeFilter.minOrderQty,
      minNotional: instrument.lotSizeFilter.minNotionalValue,
      maxLeverage: instrument.leverageFilter.maxLeverage,
    };
    this.cache.set(symbol, {
      expiresAt: this.now() + this.instrumentCacheMs,
      rules,
    });
    return rules;
  }

  async placeOrder(
    request: ExchangeOrderRequest,
  ): Promise<ExchangeOrderAcknowledgement> {
    this.validateOrder(request);
    const clientOrderId = deterministicClientOrderId(request);
    const body = {
      category: "linear",
      symbol: request.symbol,
      side: request.side === "BUY" ? "Buy" : "Sell",
      orderType: request.type === "MARKET" ? "Market" : "Limit",
      qty: request.quantity,
      ...(request.price === undefined ? {} : { price: request.price }),
      ...(request.reduceOnly === undefined
        ? {}
        : { reduceOnly: request.reduceOnly }),
      orderLinkId: clientOrderId,
    };
    const result = orderSchema.parse(
      await this.request("/v5/order/create", "POST", body, true),
    );
    if (result.orderLinkId !== clientOrderId) {
      throw new Error("Bybit returned a mismatched client order ID");
    }
    return {
      exchangeOrderId: result.orderId,
      clientOrderId: result.orderLinkId,
    };
  }

  async getSnapshot(symbol: string): Promise<ExchangeSnapshot> {
    this.validateSymbol(symbol);
    const query = (extra: Record<string, string> = {}) =>
      new URLSearchParams({ category: "linear", symbol, ...extra }).toString();
    const [openRaw, historyRaw, fillsRaw, positionsRaw, walletRaw] =
      await Promise.all([
        this.request(
          `/v5/order/realtime?${query({ openOnly: "0", limit: "50" })}`,
          "GET",
          undefined,
          true,
        ),
        this.request(
          `/v5/order/history?${query({ limit: "50" })}`,
          "GET",
          undefined,
          true,
        ),
        this.request(
          `/v5/execution/list?${query({ limit: "100" })}`,
          "GET",
          undefined,
          true,
        ),
        this.request(`/v5/position/list?${query()}`, "GET", undefined, true),
        this.request(
          "/v5/account/wallet-balance?accountType=UNIFIED&coin=USDT",
          "GET",
          undefined,
          true,
        ),
      ]);
    const byId = new Map<string, ExchangeOrderState>();
    for (const item of [
      ...ordersSchema.parse(historyRaw).list,
      ...ordersSchema.parse(openRaw).list,
    ]) {
      byId.set(item.orderId, {
        exchangeOrderId: item.orderId,
        clientOrderId: item.orderLinkId,
        side: item.side === "Buy" ? "BUY" : "SELL",
        status: this.orderStatus(item.orderStatus),
        quantity: item.qty,
        filledQuantity: item.cumExecQty,
        reduceOnly: item.reduceOnly,
      });
    }
    const fills: ExchangeFillState[] = executionsSchema
      .parse(fillsRaw)
      .list.map((item) => ({
        executionId: item.execId,
        exchangeOrderId: item.orderId,
        clientOrderId: item.orderLinkId,
        side: item.side === "Buy" ? "BUY" : "SELL",
        price: item.execPrice,
        quantity: item.execQty,
        fee: item.execFee,
        timestamp: Number(item.execTime),
      }));
    const allOpenPositions = positionsSchema
      .parse(positionsRaw)
      .list.filter(
        (item) => item.symbol === symbol && new Decimal(item.size).gt(0),
      );
    if (allOpenPositions.some((item) => item.positionIdx !== 0)) {
      throw new Error("Bybit hedge-mode positions are not supported");
    }
    const openPositions = allOpenPositions.filter(
      (item) => item.positionIdx === 0,
    );
    if (openPositions.length > 1) {
      throw new Error("Multiple one-way positions returned by Bybit");
    }
    const positionItem = openPositions[0];
    const position: ExchangePositionState | null = positionItem
      ? {
          direction: positionItem.side === "Buy" ? "LONG" : "SHORT",
          quantity: positionItem.size,
          entryPrice: positionItem.avgPrice ?? positionItem.entryPrice ?? "0",
          stopLoss: positionItem.stopLoss,
          takeProfit: positionItem.takeProfit,
        }
      : null;
    const wallet = walletSchema.parse(walletRaw).list[0];
    if (!wallet) throw new Error("Bybit wallet was not returned");
    return {
      walletBalance: wallet.totalWalletBalance,
      orders: [...byId.values()],
      fills,
      position,
    };
  }

  async setProtection(
    symbol: string,
    stopLoss: string,
    takeProfit: string,
  ): Promise<void> {
    this.validateSymbol(symbol);
    await this.request(
      "/v5/position/trading-stop",
      "POST",
      {
        category: "linear",
        symbol,
        tpslMode: "Full",
        positionIdx: 0,
        stopLoss,
        takeProfit,
        slTriggerBy: "MarkPrice",
        tpTriggerBy: "MarkPrice",
        slOrderType: "Market",
        tpOrderType: "Market",
      },
      true,
    );
  }

  closePosition(
    symbol: string,
    direction: "LONG" | "SHORT",
    quantity: string,
    idempotencyKey: string,
  ): Promise<ExchangeOrderAcknowledgement> {
    return this.placeOrder({
      symbol,
      side: direction === "LONG" ? "SELL" : "BUY",
      type: "MARKET",
      quantity,
      reduceOnly: true,
      idempotencyKey,
    });
  }

  private async request(
    path: string,
    method: "GET" | "POST",
    body?: object,
    authenticated = false,
  ): Promise<unknown> {
    const payload = body ? JSON.stringify(body) : "";
    const url = new URL(path, "https://api-testnet.bybit.com");
    for (let attempt = 0; attempt < 4; attempt++) {
      const timestamp = String(this.now());
      const receiveWindow = "5000";
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
      };
      if (authenticated) {
        headers["X-BAPI-API-KEY"] = this.credentials.apiKey;
        headers["X-BAPI-TIMESTAMP"] = timestamp;
        headers["X-BAPI-RECV-WINDOW"] = receiveWindow;
        headers["X-BAPI-SIGN"] = createHmac(
          "sha256",
          this.credentials.apiSecret,
        )
          .update(
            `${timestamp}${this.credentials.apiKey}${receiveWindow}${
              method === "GET" ? url.searchParams.toString() : payload
            }`,
          )
          .digest("hex");
      }
      const response = await this.fetcher(url, {
        method,
        headers,
        ...(body ? { body: payload } : {}),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429) {
        await this.wait(this.retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) throw new Error(`Bybit HTTP ${response.status}`);

      const envelope = envelopeSchema.parse(await response.json());
      if (envelope.retCode === 10_006) {
        await this.wait(this.retryDelay(response, attempt));
        continue;
      }
      if (envelope.retCode !== 0) {
        throw new Error(`Bybit ${envelope.retCode}: ${envelope.retMsg}`);
      }
      return envelope.result;
    }
    throw new Error("Bybit rate limit retry exhausted");
  }

  private retryDelay(response: Response, attempt: number): number {
    const reset = Number(response.headers.get("X-Bapi-Limit-Reset-Timestamp"));
    if (Number.isFinite(reset) && reset > this.now()) {
      return Math.min(reset - this.now(), 5_000);
    }
    return 250 * 2 ** attempt;
  }

  private orderStatus(status: string): ExchangeOrderStatus {
    switch (status) {
      case "New":
      case "Untriggered":
      case "Triggered":
        return "NEW";
      case "PartiallyFilled":
        return "PARTIALLY_FILLED";
      case "Filled":
        return "FILLED";
      case "Cancelled":
      case "PartiallyFilledCanceled":
      case "Deactivated":
        return "CANCELLED";
      case "Rejected":
        return "REJECTED";
      default:
        return "UNKNOWN";
    }
  }

  private validateSymbol(symbol: string): void {
    if (!/^[A-Z0-9]+$/.test(symbol)) throw new Error("Invalid symbol");
  }

  private validateOrder(request: ExchangeOrderRequest): void {
    this.validateSymbol(request.symbol);
    if (!request.idempotencyKey || request.idempotencyKey.length > 256) {
      throw new Error("Invalid idempotency key");
    }
    if (
      !new Decimal(request.quantity).isPositive() ||
      !new Decimal(request.quantity).isFinite()
    ) {
      throw new Error("Invalid quantity");
    }
    if (request.type === "LIMIT" && request.price === undefined) {
      throw new Error("Limit orders require a price");
    }
    if (
      request.price !== undefined &&
      (!new Decimal(request.price).isPositive() ||
        !new Decimal(request.price).isFinite())
    ) {
      throw new Error("Invalid price");
    }
  }
}
