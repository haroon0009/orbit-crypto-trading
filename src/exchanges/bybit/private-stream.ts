import { createHmac } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

import type { BybitCredentials } from "./testnet.js";

export type PrivateTopic = "order" | "execution" | "position" | "wallet";

export interface PrivateStreamEvent {
  topic: PrivateTopic;
  timestamp: number;
}

export interface PrivateEventSource {
  subscribe(
    onEvent: (event: PrivateStreamEvent) => Promise<void>,
    onReconnect: () => Promise<void>,
    signal: AbortSignal,
  ): Promise<void>;
}

interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

type SocketFactory = (url: string) => SocketLike;
const controlSchema = z.object({
  op: z.string(),
  success: z.boolean().optional(),
  ret_msg: z.string().optional(),
});
const eventSchema = z.object({
  topic: z.enum(["order", "execution", "position", "wallet"]),
  creationTime: z.number(),
  data: z.array(z.unknown()),
});

class FatalPrivateStreamError extends Error {}

function nativeSocket(url: string): SocketLike {
  const Constructor = (
    globalThis as unknown as {
      WebSocket?: new (address: string) => SocketLike;
    }
  ).WebSocket;
  if (!Constructor) throw new Error("This Node.js runtime has no WebSocket");
  return new Constructor(url);
}

export class BybitPrivateStream implements PrivateEventSource {
  constructor(
    private readonly credentials: BybitCredentials,
    private readonly socketFactory: SocketFactory = nativeSocket,
    private readonly now: () => number = Date.now,
    private readonly reconnectDelayMs = 1_000,
  ) {
    if (!credentials.apiKey || !credentials.apiSecret) {
      throw new Error("Bybit testnet credentials are required");
    }
  }

  async subscribe(
    onEvent: (event: PrivateStreamEvent) => Promise<void>,
    onReconnect: () => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.connect(onEvent, onReconnect, signal);
      } catch (error) {
        if (error instanceof FatalPrivateStreamError)
          throw error.cause ?? error;
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
    onEvent: (event: PrivateStreamEvent) => Promise<void>,
    onReconnect: () => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socketFactory(
        "wss://stream-testnet.bybit.com/v5/private",
      );
      let processing = Promise.resolve();
      let ping: NodeJS.Timeout | undefined;
      let fatal: unknown;
      let authenticated = false;
      const abort = () => socket.close();
      signal.addEventListener("abort", abort, { once: true });

      socket.onopen = () => {
        const expires = this.now() + 10_000;
        const signature = createHmac("sha256", this.credentials.apiSecret)
          .update(`GET/realtime${expires}`)
          .digest("hex");
        socket.send(
          JSON.stringify({
            op: "auth",
            args: [this.credentials.apiKey, expires, signature],
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
            const message: unknown = JSON.parse(raw);
            const control = controlSchema.safeParse(message);
            if (control.success && control.data.op === "auth") {
              if (control.data.success !== true) {
                throw new Error(
                  `Bybit private authentication failed: ${control.data.ret_msg ?? "unknown"}`,
                );
              }
              authenticated = true;
              socket.send(
                JSON.stringify({
                  op: "subscribe",
                  args: ["order", "execution", "position", "wallet"],
                }),
              );
              await onReconnect();
              return;
            }
            const pushed = eventSchema.safeParse(message);
            if (!pushed.success) return;
            if (!authenticated) {
              throw new Error("Private event arrived before authentication");
            }
            await onEvent({
              topic: pushed.data.topic,
              timestamp: pushed.data.creationTime,
            });
          })
          .catch((error: unknown) => {
            fatal = error;
            socket.close();
          });
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (ping) clearInterval(ping);
        signal.removeEventListener("abort", abort);
        void processing.then(() => {
          if (fatal) {
            reject(
              new FatalPrivateStreamError("Private stream failed", {
                cause: fatal,
              }),
            );
          } else {
            resolve();
          }
        });
      };
    });
  }
}
