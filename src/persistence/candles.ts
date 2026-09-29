import type pg from "pg";

import type { Candle, CandleInterval } from "../market-data/candle.js";

export interface CandleVerification {
  count: number;
  missingOpenTimes: number[];
}

export class CandleRepository {
  constructor(private readonly pool: pg.Pool) {}

  async ensureInstrument(symbol: string): Promise<string> {
    await this.pool.query(
      `INSERT INTO instruments (exchange, market_type, symbol)
       VALUES ('BYBIT', 'LINEAR', $1)
       ON CONFLICT DO NOTHING`,
      [symbol],
    );
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM instruments
       WHERE exchange = 'BYBIT' AND market_type = 'LINEAR' AND symbol = $1`,
      [symbol],
    );
    const instrument = result.rows[0];
    if (!instrument) throw new Error(`Failed to create instrument ${symbol}`);
    return instrument.id;
  }

  async insertCandles(
    instrumentId: string,
    interval: CandleInterval,
    candles: Candle[],
  ): Promise<number> {
    let inserted = 0;

    for (let offset = 0; offset < candles.length; offset += 500) {
      const batch = candles.slice(offset, offset + 500);
      const values: unknown[] = [];
      const placeholders = batch.map((candle, index) => {
        const parameter = index * 9;
        values.push(
          instrumentId,
          Number(interval),
          new Date(candle.openTime),
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
          candle.turnover,
        );
        return `(${Array.from({ length: 9 }, (_, i) => `$${parameter + i + 1}`).join(", ")})`;
      });

      const result = await this.pool.query(
        `INSERT INTO candles
          (instrument_id, interval_minutes, open_time, open, high, low, close, volume, turnover)
         VALUES ${placeholders.join(", ")}
         ON CONFLICT DO NOTHING`,
        values,
      );
      inserted += result.rowCount ?? 0;
    }

    return inserted;
  }

  async getRange(
    instrumentId: string,
    interval: CandleInterval,
    start: number,
    end: number,
  ): Promise<Candle[]> {
    const result = await this.pool.query<{
      open_time: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
      turnover: string;
    }>(
      `SELECT open_time, open::text, high::text, low::text, close::text,
              volume::text, turnover::text
       FROM candles
       WHERE instrument_id = $1 AND interval_minutes = $2
         AND open_time >= to_timestamp($3::bigint / 1000.0)
         AND open_time < to_timestamp($4::bigint / 1000.0)
       ORDER BY open_time`,
      [instrumentId, Number(interval), start, end],
    );

    return result.rows.map((row) => ({
      openTime: row.open_time.getTime(),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      turnover: row.turnover,
    }));
  }

  async verify(
    instrumentId: string,
    interval: CandleInterval,
    start: number,
    end: number,
  ): Promise<CandleVerification> {
    const result = await this.pool.query<{ open_time: string; total: string }>(
      `WITH expected AS (
         SELECT generate_series(
           to_timestamp($3::bigint / 1000.0),
           to_timestamp(($4::bigint - ($2::bigint * 60000)) / 1000.0),
           $2 * interval '1 minute'
         ) AS open_time
       ), actual AS (
         SELECT open_time
         FROM candles
         WHERE instrument_id = $1
           AND interval_minutes = $2
           AND open_time >= to_timestamp($3::bigint / 1000.0)
           AND open_time < to_timestamp($4::bigint / 1000.0)
       )
       SELECT
         (extract(epoch FROM expected.open_time) * 1000)::bigint::text AS open_time,
         (SELECT count(*)::text FROM actual) AS total
       FROM expected
       LEFT JOIN actual USING (open_time)
       WHERE actual.open_time IS NULL
       ORDER BY expected.open_time`,
      [instrumentId, Number(interval), start, end],
    );

    if (result.rows[0]) {
      return {
        count: Number(result.rows[0].total),
        missingOpenTimes: result.rows.map((row) => Number(row.open_time)),
      };
    }

    const count = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM candles
       WHERE instrument_id = $1 AND interval_minutes = $2
         AND open_time >= to_timestamp($3::bigint / 1000.0)
         AND open_time < to_timestamp($4::bigint / 1000.0)`,
      [instrumentId, Number(interval), start, end],
    );
    return { count: Number(count.rows[0]?.total ?? 0), missingOpenTimes: [] };
  }
}
