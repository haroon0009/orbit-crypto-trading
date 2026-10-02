import { Decimal } from "decimal.js";

import type { PrivateEventSource } from "../exchanges/bybit/private-stream.js";
import { deterministicClientOrderId } from "../exchanges/bybit/testnet.js";
import type {
  ExchangeAdapter,
  ExchangeOrderRequest,
  ExchangeSnapshot,
} from "../exchanges/exchange.js";
import type {
  ExecutionIntent,
  ExecutionRepository,
  TradeIntent,
} from "../persistence/execution.js";

export class TestnetExecutionEngine {
  private ready = false;

  private constructor(
    private readonly accountId: string,
    private readonly symbol: string,
    private readonly adapter: ExchangeAdapter,
    private readonly repository: ExecutionRepository,
  ) {}

  static async create(input: {
    accountKey: string;
    symbol: string;
    adapter: ExchangeAdapter;
    repository: ExecutionRepository;
  }): Promise<TestnetExecutionEngine> {
    const accountId = await input.repository.ensureAccount(
      input.accountKey,
      input.symbol,
    );
    const engine = new TestnetExecutionEngine(
      accountId,
      input.symbol,
      input.adapter,
      input.repository,
    );
    await engine.reconcile();
    return engine;
  }

  isReady(): boolean {
    return this.ready;
  }

  async submit(plan: TradeIntent): Promise<ExecutionIntent> {
    if (!this.ready) throw new Error("Testnet execution is not reconciled");
    if (await this.repository.loadActiveIntent(this.accountId)) {
      throw new Error("An execution intent is already active");
    }
    const intent = await this.repository.createIntent(this.accountId, plan);
    if (intent.state !== "PLANNED") return intent;
    return this.submitEntry(intent);
  }

  async reconcile(): Promise<void> {
    this.ready = false;
    await this.repository.setReady(this.accountId, false);
    const snapshot = await this.adapter.getSnapshot(this.symbol);
    const active = await this.repository.loadActiveIntent(this.accountId);
    let reconciled = true;

    if (active) {
      const intent = await this.reconcileIntent(active, snapshot);
      reconciled = intent.state !== "UNKNOWN";
    } else if (
      snapshot.position ||
      snapshot.orders.some(
        (order) =>
          order.status === "NEW" || order.status === "PARTIALLY_FILLED",
      )
    ) {
      reconciled = false;
    }

    await this.repository.saveReconciliation(
      this.accountId,
      snapshot,
      reconciled,
    );
    this.ready = reconciled;
  }

  runPrivateStream(
    source: PrivateEventSource,
    signal: AbortSignal,
  ): Promise<void> {
    // ponytail: full REST reconciliation per event; apply deltas only if rate limits become measurable.
    return source.subscribe(
      async () => this.reconcile(),
      async () => this.reconcile(),
      signal,
    );
  }

  private entryRequest(intent: ExecutionIntent): ExchangeOrderRequest {
    return {
      symbol: this.symbol,
      side: intent.direction === "LONG" ? "BUY" : "SELL",
      type: "MARKET",
      quantity: intent.quantity,
      idempotencyKey: `${intent.intentKey}:entry`,
    };
  }

  private async submitEntry(intent: ExecutionIntent): Promise<ExecutionIntent> {
    const request = this.entryRequest(intent);
    try {
      const acknowledgement = await this.adapter.placeOrder(request);
      intent.state = "ENTRY_SUBMITTED";
      intent.clientEntryOrderId = acknowledgement.clientOrderId;
      intent.exchangeEntryOrderId = acknowledgement.exchangeOrderId;
      intent.lastError = null;
      await this.repository.saveIntent(intent);
      return intent;
    } catch (error) {
      intent.state = "UNKNOWN";
      intent.clientEntryOrderId = deterministicClientOrderId(request);
      intent.lastError = this.errorMessage(error);
      await this.repository.saveIntent(intent);
      await this.repository.setReady(this.accountId, false);
      this.ready = false;
      throw error;
    }
  }

  private async reconcileIntent(
    intent: ExecutionIntent,
    snapshot: ExchangeSnapshot,
  ): Promise<ExecutionIntent> {
    if (intent.state === "CLOSING") {
      return this.reconcileClosing(intent, snapshot);
    }
    if (intent.state === "PROTECTED") {
      if (!snapshot.position) {
        intent.state = "CLOSED";
        intent.lastError = null;
        await this.repository.saveIntent(intent);
        return intent;
      }
      return this.protect(intent, snapshot);
    }

    const request = this.entryRequest(intent);
    const expectedClientId = deterministicClientOrderId(request);
    const order = snapshot.orders.find(
      (item) => item.clientOrderId === expectedClientId,
    );
    if (!order) {
      if (intent.state === "PLANNED") return this.submitEntry(intent);
      intent.state = "UNKNOWN";
      intent.clientEntryOrderId ??= expectedClientId;
      intent.lastError = "Entry order missing during reconciliation";
      await this.repository.saveIntent(intent);
      return intent;
    }

    intent.clientEntryOrderId = order.clientOrderId;
    intent.exchangeEntryOrderId = order.exchangeOrderId;
    if (order.status === "UNKNOWN") {
      intent.state = "UNKNOWN";
      intent.lastError = "Unknown exchange order status";
    } else if (
      order.status === "REJECTED" &&
      new Decimal(order.filledQuantity).isZero()
    ) {
      intent.state = "REJECTED";
      intent.lastError = "Entry order rejected";
    } else if (
      order.status === "CANCELLED" &&
      new Decimal(order.filledQuantity).isZero()
    ) {
      intent.state = "CANCELLED";
      intent.lastError = null;
    } else if (new Decimal(order.filledQuantity).gt(0)) {
      intent.state =
        order.status === "FILLED" ? "ENTRY_FILLED" : "ENTRY_PARTIALLY_FILLED";
      intent.lastError = null;
      await this.repository.saveIntent(intent);
      return this.protect(intent, snapshot);
    } else {
      intent.state = "ENTRY_SUBMITTED";
      intent.lastError = null;
    }
    await this.repository.saveIntent(intent);
    return intent;
  }

  private async protect(
    intent: ExecutionIntent,
    snapshot: ExchangeSnapshot,
  ): Promise<ExecutionIntent> {
    const position = snapshot.position;
    if (!position || position.direction !== intent.direction) {
      intent.state = "UNKNOWN";
      intent.lastError = "Filled order does not match an open position";
      await this.repository.saveIntent(intent);
      return intent;
    }
    if (
      position.stopLoss === intent.stopLoss &&
      position.takeProfit === intent.takeProfit &&
      new Decimal(intent.protectedQuantity).eq(position.quantity)
    ) {
      intent.state = "PROTECTED";
      intent.lastError = null;
      await this.repository.saveIntent(intent);
      return intent;
    }

    try {
      await this.adapter.setProtection(
        this.symbol,
        intent.stopLoss,
        intent.takeProfit,
      );
      intent.state = "PROTECTED";
      intent.protectedQuantity = position.quantity;
      intent.lastError = null;
    } catch (error) {
      intent.lastError = `Protection failed: ${this.errorMessage(error)}`;
      intent.state = "CLOSING";
      await this.repository.saveIntent(intent);
      try {
        await this.adapter.closePosition(
          this.symbol,
          position.direction,
          position.quantity,
          `${intent.intentKey}:emergency-close`,
        );
      } catch (closeError) {
        intent.state = "UNKNOWN";
        intent.lastError += `; emergency close failed: ${this.errorMessage(closeError)}`;
      }
    }
    await this.repository.saveIntent(intent);
    return intent;
  }

  private async reconcileClosing(
    intent: ExecutionIntent,
    snapshot: ExchangeSnapshot,
  ): Promise<ExecutionIntent> {
    if (!snapshot.position) {
      intent.state = "CLOSED";
      intent.lastError = null;
      await this.repository.saveIntent(intent);
      return intent;
    }
    const closeClientId = deterministicClientOrderId({
      symbol: this.symbol,
      side: snapshot.position.direction === "LONG" ? "SELL" : "BUY",
      idempotencyKey: `${intent.intentKey}:emergency-close`,
    });
    const closeOrder = snapshot.orders.find(
      (order) => order.clientOrderId === closeClientId,
    );
    if (
      closeOrder?.status === "REJECTED" ||
      closeOrder?.status === "CANCELLED" ||
      closeOrder?.status === "UNKNOWN"
    ) {
      intent.state = "UNKNOWN";
      intent.lastError = `Emergency close is ${closeOrder.status}`;
    } else if (!closeOrder) {
      try {
        await this.adapter.closePosition(
          this.symbol,
          snapshot.position.direction,
          snapshot.position.quantity,
          `${intent.intentKey}:emergency-close`,
        );
      } catch (error) {
        intent.state = "UNKNOWN";
        intent.lastError = `Emergency close retry failed: ${this.errorMessage(error)}`;
      }
    }
    await this.repository.saveIntent(intent);
    return intent;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
