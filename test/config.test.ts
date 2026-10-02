import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadConfig } from "../src/config.js";

const databaseUrl = "postgresql://bot:bot@localhost:5432/crypto_bot";

describe("loadConfig", () => {
  it("defaults to safe backtest mode", () => {
    const config = loadConfig({
      DATABASE_URL: databaseUrl,
      BYBIT_API_KEY: "",
      BYBIT_API_SECRET: "",
    });

    assert.equal(config.TRADING_MODE, "BACKTEST");
    assert.equal(config.REDIS_URL, "redis://localhost:6379");
  });

  it("rejects live mode without the exact confirmation", () => {
    assert.throws(() =>
      loadConfig({ DATABASE_URL: databaseUrl, TRADING_MODE: "LIVE" }),
    );
  });

  it("rejects an invalid database URL", () => {
    assert.throws(() => loadConfig({ DATABASE_URL: "not-a-postgres-url" }));
  });

  it("accepts deliberately confirmed live mode", () => {
    const config = loadConfig({
      DATABASE_URL: databaseUrl,
      TRADING_MODE: "LIVE",
      LIVE_TRADING_CONFIRMATION: "I_UNDERSTAND_REAL_MONEY_IS_AT_RISK",
    });

    assert.equal(config.TRADING_MODE, "LIVE");
  });

  it("requires both Bybit credentials in testnet mode", () => {
    assert.throws(() =>
      loadConfig({ DATABASE_URL: databaseUrl, TRADING_MODE: "TESTNET" }),
    );
    assert.equal(
      loadConfig({
        DATABASE_URL: databaseUrl,
        TRADING_MODE: "TESTNET",
        BYBIT_API_KEY: "key",
        BYBIT_API_SECRET: "secret",
      }).TRADING_MODE,
      "TESTNET",
    );
  });

  it("requires Telegram settings as a pair", () => {
    assert.throws(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        TELEGRAM_BOT_TOKEN: "token",
      }),
    );
  });
});
