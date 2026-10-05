import { randomUUID } from "node:crypto";

import { Queue, Worker, type Job } from "bullmq";
import { Decimal } from "decimal.js";
import type pg from "pg";
import type { Logger } from "pino";

import { runBacktest } from "../backtest/engine.js";
import type { Config } from "../config.js";
import { BybitMarketDataClient } from "../exchanges/bybit/market-data.js";
import {
  intervalMilliseconds,
  type CandleInterval,
} from "../market-data/candle.js";
import { importHistory } from "../market-data/history.js";
import { BacktestRepository } from "../persistence/backtests.js";
import { CandleRepository } from "../persistence/candles.js";
import { createStrategyVersion } from "../strategies/catalog.js";

export const historyQueueName = "historical-data";
export const backtestQueueName = "backtests";

export interface HistoryJobData {
  mode: "RANGE" | "SYNC";
  symbol: string;
  interval: CandleInterval;
  start?: number;
  end: number;
}

export interface BacktestJobData {
  strategyId: string;
  strategyVersion: string;
  symbol: string;
  interval: CandleInterval;
  start: number;
  end: number;
  startingBalance: string;
  tradeAmount: string;
  leverage: string;
  stopLossPercent: string;
  takeProfitPercent: string;
}

const jobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
} as const;

export function completedCandleEnd(
  interval: CandleInterval,
  now = Date.now(),
): number {
  const duration = intervalMilliseconds(interval);
  return Math.floor(now / duration) * duration;
}

export function createJobSystem(config: Config, pool: pg.Pool, logger: Logger) {
  const producerConnection = {
    url: config.REDIS_URL,
    maxRetriesPerRequest: 1,
  };
  const workerConnection = {
    url: config.REDIS_URL,
    maxRetriesPerRequest: null,
  };
  const historyQueue = new Queue<HistoryJobData>(historyQueueName, {
    connection: producerConnection,
    defaultJobOptions: jobOptions,
  });
  const backtestQueue = new Queue<BacktestJobData>(backtestQueueName, {
    connection: producerConnection,
    defaultJobOptions: jobOptions,
  });

  const historyWorker = new Worker<HistoryJobData>(
    historyQueueName,
    async (job) => runHistoryJob(job, pool),
    { connection: workerConnection, concurrency: 2 },
  );
  const backtestWorker = new Worker<BacktestJobData>(
    backtestQueueName,
    async (job) => runBacktestJob(job, pool),
    { connection: workerConnection, concurrency: 1 },
  );
  for (const worker of [historyWorker, backtestWorker]) {
    worker.on("error", (error) => logger.error({ error }, "job worker error"));
    worker.on("failed", (job, error) =>
      logger.error({ error, jobId: job?.id, queue: worker.name }, "job failed"),
    );
  }

  return {
    async enqueueHistory(data: HistoryJobData) {
      const jobId = `history-${data.mode}-${data.symbol}-${data.interval}-${data.start ?? "latest"}-${data.end}`;
      const job = await historyQueue.add("import", data, { jobId });
      return job.id;
    },
    async enqueueBacktest(data: BacktestJobData) {
      const job = await backtestQueue.add("run", data, {
        jobId: `backtest-${randomUUID()}`,
      });
      return job.id;
    },
    async status(queueName: string, jobId: string) {
      const queue =
        queueName === historyQueueName
          ? historyQueue
          : queueName === backtestQueueName
            ? backtestQueue
            : null;
      if (!queue) throw new Error("Invalid queue");
      const job = await queue.getJob(jobId);
      if (!job) throw new Error("Invalid job");
      return {
        id: job.id,
        state: await job.getState(),
        progress: job.progress,
        result: job.returnvalue as unknown,
        error: job.failedReason || null,
      };
    },
    async close() {
      await Promise.all([
        historyWorker.close(),
        backtestWorker.close(),
        historyQueue.close(),
        backtestQueue.close(),
      ]);
    },
  };
}

async function runHistoryJob(job: Job<HistoryJobData>, pool: pg.Pool) {
  const repository = new CandleRepository(pool);
  const instrumentId = await repository.ensureInstrument(job.data.symbol);
  const duration = intervalMilliseconds(job.data.interval);
  const latest = await repository.latestOpenTime(
    instrumentId,
    job.data.interval,
  );
  const start =
    job.data.mode === "SYNC"
      ? latest === null
        ? job.data.start
        : latest + duration
      : job.data.start;
  if (start === undefined) throw new Error("Cannot sync an empty dataset");
  if (start >= job.data.end) {
    return { downloaded: 0, inserted: 0, count: 0, missingOpenTimes: [] };
  }
  await job.updateProgress(10);
  const imported = await importHistory(
    { ...job.data, start },
    new BybitMarketDataClient(),
    repository,
  );
  const verification = await repository.verify(
    instrumentId,
    job.data.interval,
    start,
    job.data.end,
  );
  await job.updateProgress(100);
  return { ...imported, ...verification };
}

async function runBacktestJob(job: Job<BacktestJobData>, pool: pg.Pool) {
  const data = job.data;
  await job.updateProgress(5);
  const strategyResult = await pool.query<{
    configuration: Record<string, unknown>;
  }>(
    `SELECT configuration
     FROM strategy_versions
     WHERE strategy_id = $1 AND version = $2 AND active`,
    [data.strategyId, data.strategyVersion],
  );
  const storedStrategy = strategyResult.rows[0];
  if (!storedStrategy) throw new Error("Unsupported strategy version");
  await job.updateProgress(10);
  const repository = new CandleRepository(pool);
  const instrumentId = await repository.ensureInstrument(data.symbol);
  const verification = await repository.verify(
    instrumentId,
    data.interval,
    data.start,
    data.end,
  );
  if (verification.missingOpenTimes.length) {
    throw new Error("Historical dataset contains gaps");
  }
  const candles = await repository.getRange(
    instrumentId,
    data.interval,
    data.start,
    data.end,
  );
  await job.updateProgress(25);
  const startingBalance = new Decimal(data.startingBalance);
  const leverage = new Decimal(data.leverage);
  const result = runBacktest({
    candles,
    strategy: createStrategyVersion({
      strategyId: data.strategyId,
      strategyVersion: data.strategyVersion,
      configuration: storedStrategy.configuration,
      stopLossPercent: data.stopLossPercent,
      takeProfitPercent: data.takeProfitPercent,
    }),
    symbol: data.symbol,
    interval: data.interval,
    config: {
      startingBalance: data.startingBalance,
      feeRate: "0.0006",
      slippageBps: "2",
      closeOpenPositionAtEnd: true,
      risk: {
        allocation: data.startingBalance,
        leverage: data.leverage,
        sizing: { type: "FIXED_AMOUNT", amount: data.tradeAmount },
        instrument: {
          tickSize: "0.00000001",
          quantityStep: "0.00000001",
          minQuantity: "0.00000001",
          minNotional: "1",
          maxLeverage: data.leverage,
        },
        policy: {
          maxLeverage: data.leverage,
          maxNotional: startingBalance.mul(leverage).toString(),
          maxOpenPositions: 1,
          maxDailyLoss: startingBalance.mul("0.1").toString(),
        },
      },
    },
  });
  await job.updateProgress(90);
  await new BacktestRepository(pool).save(result);
  await job.updateProgress(100);
  return { runId: result.runId, metrics: result.metrics };
}
