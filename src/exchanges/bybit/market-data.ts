import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

import type { Candle, CandleInterval } from "../../market-data/candle.js";

const responseSchema = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.unknown(),
});

const resultSchema = z.object({
  list: z.array(
    z.tuple([
      z.string(),
      z.string(),
      z.string(),
      z.string(),
      z.string(),
      z.string(),
      z.string(),
    ]),
  ),
});

const retryableCodes = new Set([429, 10_000, 10_006, 10_016]);

export interface KlineRequest {
  symbol: string;
  interval: CandleInterval;
  start: number;
  end: number;
}

export interface KlineSource {
  getKlines(request: KlineRequest): Promise<Candle[]>;
}

export class BybitMarketDataClient implements KlineSource {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly baseUrl = "https://api.bybit.com",
  ) {}

  async getKlines(request: KlineRequest): Promise<Candle[]> {
    const url = new URL("/v5/market/kline", this.baseUrl);
    url.search = new URLSearchParams({
      category: "linear",
      symbol: request.symbol,
      interval: request.interval,
      start: String(request.start),
      end: String(request.end),
      limit: "1000",
    }).toString();

    for (let attempt = 0; attempt < 5; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: { accept: "application/json", connection: "close" },
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        if (attempt === 4) throw error;
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt === 4) throw new Error(`Bybit HTTP ${response.status}`);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Bybit HTTP ${response.status}`);

      const body = responseSchema.parse(await response.json());
      if (retryableCodes.has(body.retCode)) {
        if (attempt === 4) {
          throw new Error(`Bybit ${body.retCode}: ${body.retMsg}`);
        }
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (body.retCode !== 0) {
        throw new Error(`Bybit ${body.retCode}: ${body.retMsg}`);
      }
      const result = resultSchema.parse(body.result);

      return result.list
        .map(
          ([openTime, open, high, low, close, volume, turnover]): Candle => ({
            openTime: Number(openTime),
            open,
            high,
            low,
            close,
            volume,
            turnover,
          }),
        )
        .sort((a, b) => a.openTime - b.openTime);
    }

    throw new Error("Bybit request failed");
  }
}
