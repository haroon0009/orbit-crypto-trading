import { randomUUID } from "node:crypto";

import { Decimal } from "decimal.js";
import type pg from "pg";

import type { ExchangeSnapshot } from "../exchanges/exchange.js";

export type ExecutionIntentState =
  | "PLANNED"
  | "ENTRY_SUBMITTED"
  | "ENTRY_PARTIALLY_FILLED"
  | "ENTRY_FILLED"
  | "PROTECTED"
  | "CLOSING"
  | "CLOSED"
  | "CANCELLED"
  | "REJECTED"
  | "UNKNOWN"
  | "FAILED";

export interface ExecutionIntent {
  id: string;
  accountId: string;
  intentKey: string;
  direction: "LONG" | "SHORT";
  quantity: string;
  stopLoss: string;
  takeProfit: string;
  state: ExecutionIntentState;
  clientEntryOrderId: string | null;
  exchangeEntryOrderId: string | null;
  protectedQuantity: string;
  lastError: string | null;
}

export interface TradeIntent {
  intentKey: string;
  direction: "LONG" | "SHORT";
  quantity: string;
  stopLoss: string;
  takeProfit: string;
}

const terminalStates: ExecutionIntentState[] = [
  "CLOSED",
  "CANCELLED",
  "REJECTED",
  "FAILED",
];

export class ExecutionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async ensureAccount(accountKey: string, symbol: string): Promise<string> {
    await this.pool.query(
      `INSERT INTO execution_accounts (id, account_key, symbol)
       VALUES ($1, $2, $3) ON CONFLICT (account_key) DO NOTHING`,
      [randomUUID(), accountKey, symbol],
    );
    const result = await this.pool.query<{ id: string; symbol: string }>(
      `SELECT id, symbol FROM execution_accounts WHERE account_key = $1`,
      [accountKey],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Execution account not found: ${accountKey}`);
    if (row.symbol !== symbol) {
      throw new Error(`Execution account symbol changed: ${accountKey}`);
    }
    return row.id;
  }

  async setReady(accountId: string, ready: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE execution_accounts SET ready = $2, updated_at = now()
       WHERE id = $1`,
      [accountId, ready],
    );
  }

  async saveReconciliation(
    accountId: string,
    snapshot: ExchangeSnapshot,
    ready: boolean,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE execution_accounts
       SET ready = $2, reconciled_snapshot = $3::jsonb,
           last_reconciled_at = now(), updated_at = now()
       WHERE id = $1`,
      [accountId, ready, JSON.stringify(snapshot)],
    );
  }

  async createIntent(
    accountId: string,
    plan: TradeIntent,
  ): Promise<ExecutionIntent> {
    if (
      !plan.intentKey ||
      !new Decimal(plan.quantity).isPositive() ||
      !new Decimal(plan.stopLoss).isPositive() ||
      !new Decimal(plan.takeProfit).isPositive()
    ) {
      throw new Error("Invalid execution intent");
    }
    await this.pool.query(
      `INSERT INTO execution_intents
        (id, account_id, intent_key, direction, quantity, stop_loss, take_profit, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PLANNED')
       ON CONFLICT (account_id, intent_key) DO NOTHING`,
      [
        randomUUID(),
        accountId,
        plan.intentKey,
        plan.direction,
        plan.quantity,
        plan.stopLoss,
        plan.takeProfit,
      ],
    );
    const intent = await this.loadIntent(accountId, plan.intentKey);
    if (
      intent.direction !== plan.direction ||
      !new Decimal(intent.quantity).eq(plan.quantity) ||
      !new Decimal(intent.stopLoss).eq(plan.stopLoss) ||
      !new Decimal(intent.takeProfit).eq(plan.takeProfit)
    ) {
      throw new Error(`Execution intent changed: ${plan.intentKey}`);
    }
    return intent;
  }

  async loadActiveIntent(accountId: string): Promise<ExecutionIntent | null> {
    const result = await this.pool.query(
      `SELECT * FROM execution_intents
       WHERE account_id = $1 AND state <> ALL($2::text[])
       ORDER BY created_at LIMIT 1`,
      [accountId, terminalStates],
    );
    return result.rows[0] ? this.mapIntent(result.rows[0]) : null;
  }

  async loadIntent(
    accountId: string,
    intentKey: string,
  ): Promise<ExecutionIntent> {
    const result = await this.pool.query(
      `SELECT * FROM execution_intents WHERE account_id = $1 AND intent_key = $2`,
      [accountId, intentKey],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Execution intent not found: ${intentKey}`);
    return this.mapIntent(row);
  }

  async saveIntent(intent: ExecutionIntent): Promise<void> {
    const result = await this.pool.query(
      `UPDATE execution_intents
       SET state = $2, client_entry_order_id = $3,
           exchange_entry_order_id = $4, protected_quantity = $5,
           last_error = $6, updated_at = now()
       WHERE id = $1`,
      [
        intent.id,
        intent.state,
        intent.clientEntryOrderId,
        intent.exchangeEntryOrderId,
        intent.protectedQuantity,
        intent.lastError,
      ],
    );
    if (result.rowCount !== 1) throw new Error("Execution intent disappeared");
  }

  private mapIntent(row: Record<string, unknown>): ExecutionIntent {
    return {
      id: String(row.id),
      accountId: String(row.account_id),
      intentKey: String(row.intent_key),
      direction: row.direction as "LONG" | "SHORT",
      quantity: String(row.quantity),
      stopLoss: String(row.stop_loss),
      takeProfit: String(row.take_profit),
      state: row.state as ExecutionIntentState,
      clientEntryOrderId:
        row.client_entry_order_id === null
          ? null
          : String(row.client_entry_order_id),
      exchangeEntryOrderId:
        row.exchange_entry_order_id === null
          ? null
          : String(row.exchange_entry_order_id),
      protectedQuantity: String(row.protected_quantity),
      lastError: row.last_error === null ? null : String(row.last_error),
    };
  }
}
