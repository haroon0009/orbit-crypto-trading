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
    DATABASE_URL: z.url().startsWith("postgresql://"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  })
  .superRefine((env, context) => {
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
