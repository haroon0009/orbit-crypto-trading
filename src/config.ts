import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { z } from "zod";

if (existsSync(".env")) loadEnvFile();

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    TRADING_MODE: z
      .enum(["BACKTEST", "PAPER", "TESTNET", "LIVE"])
      .default("BACKTEST"),
    LIVE_TRADING_CONFIRMATION: z.string().optional(),
    BYBIT_API_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    BYBIT_API_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    TELEGRAM_BOT_TOKEN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    TELEGRAM_CHAT_ID: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(1).optional(),
    ),
    DATABASE_URL: z.url().startsWith("postgresql://"),
    REDIS_URL: z.url().startsWith("redis://").default("redis://localhost:6379"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  })
  .superRefine((env, context) => {
    if (Boolean(env.TELEGRAM_BOT_TOKEN) !== Boolean(env.TELEGRAM_CHAT_ID)) {
      context.addIssue({
        code: "custom",
        path: ["TELEGRAM_BOT_TOKEN"],
        message: "Telegram token and chat ID must be configured together",
      });
    }
    if (
      env.TRADING_MODE === "TESTNET" &&
      (!env.BYBIT_API_KEY || !env.BYBIT_API_SECRET)
    ) {
      context.addIssue({
        code: "custom",
        path: ["BYBIT_API_KEY"],
        message: "Bybit credentials are required in testnet mode",
      });
    }
    if (
      env.TRADING_MODE === "LIVE" &&
      env.LIVE_TRADING_CONFIRMATION !== "I_UNDERSTAND_REAL_MONEY_IS_AT_RISK"
    ) {
      context.addIssue({
        code: "custom",
        path: ["LIVE_TRADING_CONFIRMATION"],
        message: "Live trading requires explicit confirmation",
      });
    }
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
