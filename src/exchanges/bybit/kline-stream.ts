import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

import { validateCandle } from "../../market-data/candle.js";
import type { Candle, CandleInterval } from "../../market-data/candle.js";
import type { FinalizedCandleSource } from "../../market-data/live.js";

const messageSchema = z.object({
  topic: z.string(),
  data: z.array(
    z.object({
      start: z.number(),
      open: z.string(),
      high: z.string(),
      low: z.string(),
      close: z.string(),
      volume: z.string(),
      turnover: z.string(),
      confirm: z.boolean(),
    }),
  ),
});

interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

type SocketFactory = (url: string) => SocketLike;

class StreamDataError extends Error {}

export interface KlineUpdate {
  candle: Candle;
  finalized: boolean;
}

export function parseKlineUpdates(
  raw: string,
  symbol: string,
  interval: CandleInterval,
): KlineUpdate[] {
  const json: unknown = JSON.parse(raw);
  if (
    typeof json !== "object" ||
    json === null ||
    !("topic" in json) ||
    json.topic !== `kline.${interval}.${symbol}`
  ) {
    return [];
  }
  const message = messageSchema.parse(json);
  return message.data
    .map((item) => ({
      candle: validateCandle(
        {
          openTime: item.start,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
          turnover: item.turnover,
        },
        interval,
      ),
      finalized: item.confirm,
    }))
    .sort((a, b) => a.candle.openTime - b.candle.openTime);
}

export function parseFinalizedKlines(
  raw: string,
  symbol: string,
  interval: CandleInterval,
): Candle[] {
  return parseKlineUpdates(raw, symbol, interval)
    .filter((update) => update.finalized)
    .map((update) => update.candle);
}

function nativeSocket(url: string): SocketLike {
  const Constructor = (
    globalThis as unknown as {
      WebSocket?: new (address: string) => SocketLike;
    }
  ).WebSocket;
  if (!Constructor) throw new Error("This Node.js runtime has no WebSocket");
  return new Constructor(url);
}

export class BybitKlineStream implements FinalizedCandleSource {
  constructor(
    private readonly socketFactory: SocketFactory = nativeSocket,
    private readonly url = "wss://stream.bybit.com/v5/public/linear",
    private readonly reconnectDelayMs = 1_000,
  ) {}

  async subscribe(
    request: { symbol: string; interval: CandleInterval },
    onCandle: (candle: Candle) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    await this.subscribeUpdates(
      request,
      async (update) => {
        if (update.finalized) await onCandle(update.candle);
      },
      signal,
    );
  }

  async subscribeUpdates(
    request: { symbol: string; interval: CandleInterval },
    onUpdate: (update: KlineUpdate) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.connect(request, onUpdate, signal);
      } catch (error) {
        if (error instanceof StreamDataError) throw error.cause ?? error;
        if (signal.aborted) return;
      }
      if (!signal.aborted) {
        await sleep(this.reconnectDelayMs, undefined, { signal }).catch(
          () => {},
        );
      }
    }
  }

  private connect(
    request: { symbol: string; interval: CandleInterval },
    onUpdate: (update: KlineUpdate) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socketFactory(this.url);
      let processing = Promise.resolve();
      let ping: NodeJS.Timeout | undefined;
      let fatal: unknown;

      const abort = () => socket.close();
      signal.addEventListener("abort", abort, { once: true });
      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            op: "subscribe",
            args: [`kline.${request.interval}.${request.symbol}`],
          }),
        );
        ping = setInterval(
          () => socket.send(JSON.stringify({ op: "ping" })),
          20_000,
        );
      };
      socket.onmessage = (event) => {
        processing = processing
          .then(async () => {
            const raw =
              typeof event.data === "string"
                ? event.data
                : Buffer.from(event.data as ArrayBuffer).toString("utf8");
            for (const update of parseKlineUpdates(
              raw,
              request.symbol,
              request.interval,
            )) {
              await onUpdate(update);
            }
          })
          .catch((error: unknown) => {
            fatal = error;
            socket.close();
          });
      };
      socket.onerror = () => {};
      socket.onclose = () => {
        if (ping) clearInterval(ping);
        signal.removeEventListener("abort", abort);
        void processing.then(() => {
          if (fatal)
            reject(
              new StreamDataError("Invalid stream data", { cause: fatal }),
            );
          else resolve();
        });
      };
    });
  }
}
