import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { Pool } from "pg";

import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import { deterministicClientOrderId } from "../src/exchanges/bybit/testnet.js";
import type {
  ExchangeAdapter,
  ExchangeOrderAcknowledgement,
  ExchangeOrderRequest,
  ExchangeSnapshot,
} from "../src/exchanges/exchange.js";
import { TestnetExecutionEngine } from "../src/execution/testnet-engine.js";
import {
  ExecutionRepository,
  type TradeIntent,
} from "../src/persistence/execution.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bot:bot@localhost:5433/crypto_bot";
const emptySnapshot = (): ExchangeSnapshot => ({
  walletBalance: "1000",
  orders: [],
  fills: [],
  position: null,
});
const plan: TradeIntent = {
  intentKey: "strategy:signal:1",
  direction: "LONG",
  quantity: "2",
  stopLoss: "98",
  takeProfit: "104",
};

class FakeAdapter implements ExchangeAdapter {
  snapshot = emptySnapshot();
  placeCalls: ExchangeOrderRequest[] = [];
  protectionCalls = 0;
  closeCalls = 0;
  failProtection = false;

  async getInstrumentRules() {
    return {
      tickSize: "1",
      quantityStep: "1",
      minQuantity: "1",
      minNotional: "1",
      maxLeverage: "10",
    };
  }

  async placeOrder(
    request: ExchangeOrderRequest,
  ): Promise<ExchangeOrderAcknowledgement> {
    this.placeCalls.push(request);
    return {
      exchangeOrderId: `exchange-${this.placeCalls.length}`,
      clientOrderId: deterministicClientOrderId(request),
    };
  }

  async getSnapshot(): Promise<ExchangeSnapshot> {
    return structuredClone(this.snapshot);
  }

  async setProtection(): Promise<void> {
    this.protectionCalls++;
    if (this.failProtection) throw new Error("stop rejected");
  }

  async closePosition(
    symbol: string,
    direction: "LONG" | "SHORT",
    quantity: string,
    idempotencyKey: string,
  ): Promise<ExchangeOrderAcknowledgement> {
    this.closeCalls++;
    const request: ExchangeOrderRequest = {
      symbol,
      side: direction === "LONG" ? "SELL" : "BUY",
      type: "MARKET",
      quantity,
      reduceOnly: true,
      idempotencyKey,
    };
    return {
      exchangeOrderId: `close-${this.closeCalls}`,
      clientOrderId: deterministicClientOrderId(request),
    };
  }
}

function entryOrder(
  status: ExchangeSnapshot["orders"][number]["status"],
  filledQuantity: string,
) {
  const request: ExchangeOrderRequest = {
    symbol: "BTCUSDT",
    side: "BUY",
    type: "MARKET",
    quantity: "2",
    idempotencyKey: `${plan.intentKey}:entry`,
  };
  return {
    exchangeOrderId: "exchange-entry",
    clientOrderId: deterministicClientOrderId(request),
    side: "BUY" as const,
    status,
    quantity: "2",
    filledQuantity,
    reduceOnly: false,
  };
}

describe("testnet execution recovery", () => {
  let pool: Pool;
  let repository: ExecutionRepository;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    await migrate();
    pool = createPool(databaseUrl);
    repository = new ExecutionRepository(pool);
  });

  after(async () => pool.end());

  async function createEngine(accountKey: string, adapter: FakeAdapter) {
    return TestnetExecutionEngine.create({
      accountKey,
      symbol: "BTCUSDT",
      adapter,
      repository,
    });
  }

  async function clean(accountKey: string) {
    await pool.query("DELETE FROM execution_accounts WHERE account_key = $1", [
      accountKey,
    ]);
  }

  it("recovers planned, partial, filled, protected, and closed states", async () => {
    const accountKey = `EXEC-${randomUUID()}`;
    const adapter = new FakeAdapter();
    const accountId = await repository.ensureAccount(accountKey, "BTCUSDT");
    await repository.createIntent(accountId, plan);

    let engine = await createEngine(accountKey, adapter);
    assert.equal(adapter.placeCalls.length, 1);
    assert.equal(
      (await repository.loadIntent(accountId, plan.intentKey)).state,
      "ENTRY_SUBMITTED",
    );

    adapter.snapshot = {
      ...emptySnapshot(),
      orders: [entryOrder("PARTIALLY_FILLED", "1")],
      position: {
        direction: "LONG",
        quantity: "1",
        entryPrice: "100",
        stopLoss: "",
        takeProfit: "",
      },
    };
    await engine.reconcile();
    assert.equal(adapter.protectionCalls, 1);
    assert.equal(
      (await repository.loadIntent(accountId, plan.intentKey)).state,
      "PROTECTED",
    );

    adapter.snapshot = {
      ...adapter.snapshot,
      orders: [entryOrder("FILLED", "2")],
      position: {
        direction: "LONG",
        quantity: "2",
        entryPrice: "100",
        stopLoss: "98",
        takeProfit: "104",
      },
    };
    engine = await createEngine(accountKey, adapter);
    assert.equal(engine.isReady(), true);
    assert.equal(adapter.protectionCalls, 2);

    adapter.snapshot = emptySnapshot();
    await engine.reconcile();
    assert.equal(
      (await repository.loadIntent(accountId, plan.intentKey)).state,
      "CLOSED",
    );
    const callsBeforeReplay = adapter.placeCalls.length;
    assert.equal((await engine.submit(plan)).state, "CLOSED");
    assert.equal(adapter.placeCalls.length, callsBeforeReplay);
    await clean(accountKey);
  });

  it("closes a filled position when native protection fails and recovers closing", async () => {
    const accountKey = `STOP-${randomUUID()}`;
    const adapter = new FakeAdapter();
    let engine = await createEngine(accountKey, adapter);
    await engine.submit(plan);
    const accountId = await repository.ensureAccount(accountKey, "BTCUSDT");
    adapter.failProtection = true;
    adapter.snapshot = {
      ...emptySnapshot(),
      orders: [entryOrder("FILLED", "2")],
      position: {
        direction: "LONG",
        quantity: "2",
        entryPrice: "100",
        stopLoss: "",
        takeProfit: "",
      },
    };

    await engine.reconcile();
    assert.equal(adapter.closeCalls, 1);
    assert.equal(
      (await repository.loadIntent(accountId, plan.intentKey)).state,
      "CLOSING",
    );

    engine = await createEngine(accountKey, adapter);
    assert.equal(adapter.closeCalls, 2);
    adapter.snapshot = emptySnapshot();
    await engine.reconcile();
    assert.equal(
      (await repository.loadIntent(accountId, plan.intentKey)).state,
      "CLOSED",
    );
    await clean(accountKey);
  });

  it("handles rejected, cancelled, and unknown orders without unsafe resubmission", async () => {
    for (const status of ["REJECTED", "CANCELLED"] as const) {
      const accountKey = `${status}-${randomUUID()}`;
      const adapter = new FakeAdapter();
      const engine = await createEngine(accountKey, adapter);
      await engine.submit(plan);
      const accountId = await repository.ensureAccount(accountKey, "BTCUSDT");
      adapter.snapshot = {
        ...emptySnapshot(),
        orders: [entryOrder(status, "0")],
      };
      await engine.reconcile();
      assert.equal(
        (await repository.loadIntent(accountId, plan.intentKey)).state,
        status,
      );
      assert.equal(engine.isReady(), true);
      await clean(accountKey);
    }

    const accountKey = `UNKNOWN-${randomUUID()}`;
    const adapter = new FakeAdapter();
    const engine = await createEngine(accountKey, adapter);
    await engine.submit(plan);
    const accountId = await repository.ensureAccount(accountKey, "BTCUSDT");
    await engine.reconcile();
    assert.equal(engine.isReady(), false);
    assert.equal(
      (await repository.loadIntent(accountId, plan.intentKey)).state,
      "UNKNOWN",
    );
    await assert.rejects(
      () => engine.submit({ ...plan, intentKey: "other" }),
      /not reconciled/,
    );

    adapter.snapshot = {
      ...emptySnapshot(),
      orders: [entryOrder("NEW", "0")],
    };
    await engine.reconcile();
    assert.equal(engine.isReady(), true);
    assert.equal(
      (await repository.loadIntent(accountId, plan.intentKey)).state,
      "ENTRY_SUBMITTED",
    );
    assert.equal(adapter.placeCalls.length, 1);
    await clean(accountKey);
  });
});
