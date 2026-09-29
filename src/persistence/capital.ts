import { randomUUID } from "node:crypto";

import { Decimal } from "decimal.js";
import type pg from "pg";

import {
  evaluateRisk,
  type RiskDecision,
  type RiskRequest,
} from "../risk/risk.js";

type ReservationRequest = Omit<
  RiskRequest,
  "allocatedCapital" | "availableCapital"
>;

export class CapitalAllocationRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(accountKey: string, totalCapital: string): Promise<string> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO capital_allocations (id, account_key, total_capital)
       VALUES ($1, $2, $3)`,
      [id, accountKey, totalCapital],
    );
    return id;
  }

  async reserve(
    accountKey: string,
    input: ReservationRequest,
  ): Promise<RiskDecision> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const allocation = await client.query<{
        id: string;
        total_capital: string;
        reserved_capital: string;
      }>(
        `SELECT id, total_capital::text, reserved_capital::text
         FROM capital_allocations WHERE account_key = $1 FOR UPDATE`,
        [accountKey],
      );
      const row = allocation.rows[0];
      if (!row) throw new Error(`Unknown allocation: ${accountKey}`);
      const request: RiskRequest = {
        ...input,
        allocatedCapital: row.total_capital,
        availableCapital: new Decimal(row.total_capital)
          .minus(row.reserved_capital)
          .toString(),
      };
      const decision = evaluateRisk(request);

      if (decision.accepted && decision.capitalRequired) {
        await client.query(
          `UPDATE capital_allocations
           SET reserved_capital = reserved_capital + $2, updated_at = now()
           WHERE id = $1`,
          [row.id, decision.capitalRequired],
        );
      }
      await client.query(
        `INSERT INTO risk_decisions
          (allocation_id, occurred_at, accepted, reason_code, inputs, output)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [
          row.id,
          new Date(request.timestamp),
          decision.accepted,
          decision.reason,
          JSON.stringify(request),
          JSON.stringify(decision),
        ],
      );
      await client.query("COMMIT");
      return decision;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async release(accountKey: string, capital: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE capital_allocations
       SET reserved_capital = reserved_capital - $2, updated_at = now()
       WHERE account_key = $1 AND reserved_capital >= $2`,
      [accountKey, capital],
    );
    if (result.rowCount !== 1) throw new Error("Invalid capital release");
  }
}
