import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { Decimal } from "decimal.js";

import { loadConfig } from "../config.js";
import { createPool } from "../db/pool.js";
import { BybitKlineStream } from "../exchanges/bybit/kline-stream.js";
import { BybitMarketDataClient } from "../exchanges/bybit/market-data.js";
import { createLogger } from "../logger.js";
import {
  backtestQueueName,
  completedCandleEnd,
  createJobSystem,
  historyQueueName,
} from "../jobs/system.js";
import {
  candleIntervals,
  intervalMilliseconds,
  type CandleInterval,
} from "../market-data/candle.js";
import { validateRange } from "../market-data/history.js";
import {
  BotRepository,
  StrategyRepository,
  botAssignmentSchema,
} from "../persistence/bots.js";
import {
  loadBacktestDetail,
  loadDashboard,
  parseDashboardQuery,
} from "./dashboard.js";

const config = loadConfig();
const logger = createLogger(config);
const pool = createPool(config.DATABASE_URL);
const jobs = createJobSystem(config, pool, logger);
const port = Number(process.env.UI_PORT ?? "3000");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("UI_PORT must be a valid TCP port");
}

const dashboardRoot = resolve("public/dashboard");
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function readJson(request: AsyncIterable<Buffer>) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "POST" && url.pathname === "/api/bots") {
      const parsed = botAssignmentSchema.safeParse(await readJson(request));
      if (!parsed.success) {
        throw new Error(
          `Invalid assignment: ${parsed.error.issues[0]?.message ?? "invalid configuration"}`,
        );
      }
      await new BotRepository(pool).create(parsed.data);
      response.writeHead(201, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ created: true }));
      return;
    }

    const statusMatch = url.pathname.match(
      /^\/api\/bots\/([0-9a-f-]{36})\/status$/i,
    );
    if (request.method === "PATCH" && statusMatch) {
      const id = statusMatch[1];
      const body = await readJson(request);
      if (
        !id ||
        typeof body !== "object" ||
        body === null ||
        typeof (body as { active?: unknown }).active !== "boolean"
      ) {
        throw new Error("Invalid bot status");
      }
      await new BotRepository(pool).setActive(
        id,
        (body as { active: boolean }).active,
      );
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ updated: true }));
      return;
    }

    const strategyStatusMatch = url.pathname.match(
      /^\/api\/strategies\/([A-Z0-9_]+)\/([A-Za-z0-9._-]+)\/status$/,
    );
    if (request.method === "PATCH" && strategyStatusMatch) {
      const strategyId = strategyStatusMatch[1];
      const version = strategyStatusMatch[2];
      const body = await readJson(request);
      if (
        !strategyId ||
        !version ||
        typeof body !== "object" ||
        body === null ||
        typeof (body as { active?: unknown }).active !== "boolean"
      ) {
        throw new Error("Invalid strategy status");
      }
      await new StrategyRepository(pool).setActive(
        strategyId,
        version,
        (body as { active: boolean }).active,
      );
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ updated: true }));
      return;
    }

    const strategyMatch = url.pathname.match(
      /^\/api\/strategies\/([A-Z0-9_]+)\/([A-Za-z0-9._-]+)$/,
    );
    if (request.method === "DELETE" && strategyMatch) {
      const strategyId = strategyMatch[1];
      const version = strategyMatch[2];
      if (!strategyId || !version) throw new Error("Invalid strategy version");
      await new StrategyRepository(pool).delete(strategyId, version);
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ deleted: true }));
      return;
    }

    const botMatch = url.pathname.match(/^\/api\/bots\/([0-9a-f-]{36})$/i);
    if (request.method === "PATCH" && botMatch) {
      const id = botMatch[1];
      const parsed = botAssignmentSchema.safeParse(await readJson(request));
      if (!id || !parsed.success) {
        throw new Error(
          `Invalid assignment: ${parsed.error?.issues[0]?.message ?? "invalid configuration"}`,
        );
      }
      await new BotRepository(pool).update(id, parsed.data);
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ updated: true }));
      return;
    }
    if (request.method === "DELETE" && botMatch) {
      const id = botMatch[1];
      if (!id) throw new Error("Invalid bot assignment");
      await new BotRepository(pool).delete(id);
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ deleted: true }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/historical-data") {
      const body = await readJson(request);
      if (typeof body !== "object" || body === null)
        throw new Error("Invalid request");
      const input = body as Record<string, unknown>;
      const symbol = String(input.symbol ?? "").toUpperCase();
      const interval = String(input.interval ?? "") as CandleInterval;
      if (!candleIntervals.includes(interval))
        throw new Error("Unsupported interval");
      const sync = input.sync === true;
      const end = sync
        ? completedCandleEnd(interval)
        : Date.parse(String(input.end ?? ""));
      const start = sync ? undefined : Date.parse(String(input.start ?? ""));
      if (!sync) {
        if (!Number.isFinite(start) || !Number.isFinite(end))
          throw new Error("Invalid date range");
        validateRange({ symbol, interval, start: start!, end });
        if (end > completedCandleEnd(interval)) {
          throw new Error(
            "Invalid date range: historical data cannot include an unfinished candle",
          );
        }
      }
      const jobId = await jobs.enqueueHistory({
        mode: sync ? "SYNC" : "RANGE",
        symbol,
        interval,
        ...(start === undefined ? {} : { start }),
        end,
      });
      response.writeHead(202, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ queue: historyQueueName, jobId }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/backtests") {
      const body = await readJson(request);
      if (typeof body !== "object" || body === null)
        throw new Error("Invalid request");
      const input = body as Record<string, unknown>;
      const exchange = String(input.exchange ?? "BYBIT");
      const symbol = String(input.symbol ?? "").toUpperCase();
      const interval = String(input.interval ?? "") as CandleInterval;
      const start = Date.parse(String(input.start ?? ""));
      const end = Date.parse(String(input.end ?? ""));
      const strategyId = String(input.strategyId ?? "");
      const strategyVersion = String(input.strategyVersion ?? "");
      const startingBalance = String(
        input.totalCapital ?? input.startingBalance ?? "",
      );
      const minTradeAmount = String(
        input.minTradeAmount ?? input.tradeAmount ?? "",
      );
      const tradeAmount = String(
        input.maxTradeAmount ?? input.tradeAmount ?? "",
      );
      const leverage = String(input.leverage ?? "");
      const stopLossPercent = String(input.stopLossPercent ?? "");
      const takeProfitPercent = String(input.takeProfitPercent ?? "");
      if (!candleIntervals.includes(interval))
        throw new Error("Unsupported interval");
      if (exchange !== "BYBIT") throw new Error("Unsupported exchange");
      if (!Number.isFinite(start) || !Number.isFinite(end))
        throw new Error("Invalid date range");
      validateRange({ symbol, interval, start, end });
      if (strategyId !== "EMA_CROSS" || strategyVersion !== "1.0.0") {
        throw new Error("Unsupported strategy version");
      }
      const numberInputs = [
        startingBalance,
        minTradeAmount,
        tradeAmount,
        leverage,
        stopLossPercent,
        takeProfitPercent,
      ];
      if (!numberInputs.every((value) => /^\d+(?:\.\d+)?$/.test(value))) {
        throw new Error("Invalid backtest configuration");
      }
      const numbers = numberInputs.map((value) => new Decimal(value));
      if (
        numbers.some((value) => !value.isFinite() || value.lte(0)) ||
        numbers[1]!.gt(numbers[2]!) ||
        numbers[2]!.gt(numbers[0]!)
      ) {
        throw new Error("Invalid backtest configuration");
      }
      const jobId = await jobs.enqueueBacktest({
        strategyId,
        strategyVersion,
        symbol,
        interval,
        start,
        end,
        startingBalance,
        tradeAmount,
        leverage,
        stopLossPercent,
        takeProfitPercent,
      });
      response.writeHead(202, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ queue: backtestQueueName, jobId }));
      return;
    }

    if (request.method !== "GET") {
      response.writeHead(405).end("Method not allowed");
      return;
    }

    const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/([^/]+)$/);
    if (jobMatch) {
      const queueName = decodeURIComponent(jobMatch[1] ?? "");
      const jobId = decodeURIComponent(jobMatch[2] ?? "");
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(await jobs.status(queueName, jobId)));
      return;
    }

    if (url.pathname === "/api/dashboard") {
      const { symbol, interval } = parseDashboardQuery(url);
      const data = await loadDashboard(
        pool,
        symbol,
        interval,
        config.TRADING_MODE,
      );
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(data));
      return;
    }

    const backtestDetailMatch = url.pathname.match(
      /^\/api\/backtests\/([0-9a-f-]{36})$/i,
    );
    if (backtestDetailMatch) {
      const detail = await loadBacktestDetail(
        pool,
        backtestDetailMatch[1] ?? "",
      );
      response.writeHead(detail ? 200 : 404, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(detail ?? { error: "Backtest not found" }));
      return;
    }

    if (url.pathname === "/api/market-stream") {
      const { symbol, interval } = parseDashboardQuery(url);
      const liveInterval = String(interval) as CandleInterval;
      if (interval === 1440) throw new Error("Unsupported live interval");
      const duration = intervalMilliseconds(liveInterval);
      const end = Date.now();
      const snapshot = await new BybitMarketDataClient().getKlines({
        symbol,
        interval: liveInterval,
        start: Math.floor(end / duration) * duration - duration * 199,
        end,
      });
      const controller = new AbortController();
      request.once("close", () => controller.abort());
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });
      response.write("event: connected\ndata: {}\n\n");
      response.write(
        `event: snapshot\ndata: ${JSON.stringify({
          candles: snapshot.map((candle) => ({
            time: candle.openTime / 1000,
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close),
            volume: Number(candle.volume),
          })),
        })}\n\n`,
      );
      const keepAlive = setInterval(
        () => response.write(": keepalive\n\n"),
        15_000,
      );
      // ponytail: one exchange socket per local viewer; share subscriptions if multi-user access is added.
      void new BybitKlineStream()
        .subscribeUpdates(
          { symbol, interval: liveInterval },
          async ({ candle, finalized }) => {
            response.write(
              `data: ${JSON.stringify({
                candle: {
                  time: candle.openTime / 1000,
                  open: Number(candle.open),
                  high: Number(candle.high),
                  low: Number(candle.low),
                  close: Number(candle.close),
                  volume: Number(candle.volume),
                },
                finalized,
              })}\n\n`,
            );
          },
          controller.signal,
        )
        .catch((error: unknown) => {
          logger.warn(
            { error, symbol, interval },
            "live dashboard stream stopped",
          );
          response.end();
        })
        .finally(() => clearInterval(keepAlive));
      return;
    }

    const requestedPath = url.pathname.startsWith("/assets/")
      ? url.pathname.slice(1)
      : "index.html";
    const assetPath = resolve(dashboardRoot, requestedPath);
    if (!assetPath.startsWith(dashboardRoot)) throw new Error("Invalid path");
    const extension = assetPath.slice(assetPath.lastIndexOf("."));
    response.writeHead(200, {
      "content-type": contentTypes[extension] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(await readFile(assetPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.startsWith("Conflict")
      ? 409
      : message.startsWith("Invalid") || message.startsWith("Unsupported")
        ? 400
        : 500;
    logger.error({ error }, "dashboard request failed");
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: message }));
  }
});

server.listen(port, "127.0.0.1", () => {
  logger.info({ url: `http://127.0.0.1:${port}` }, "dashboard started");
});

async function shutdown() {
  server.close();
  await jobs.close();
  await pool.end();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
