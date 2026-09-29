# Crypto Futures Bot

Private, safety-first crypto futures research and trading system. Historical ingestion and the deterministic backtest kernel are complete; live trading remains disabled.

## Development

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm check
pnpm dev
```

Configuration is validated at startup. `TRADING_MODE` defaults to `BACKTEST`; live mode additionally requires the exact confirmation documented in `.env.example` when live execution is implemented.

## Historical candles

Import and verify finalized Bybit USDT perpetual candles:

```powershell
pnpm candles:import -- --symbol BTCUSDT --interval 15 --start 2023-01-01
```

Recheck an existing range without downloading it:

```powershell
pnpm candles:verify -- --symbol BTCUSDT --interval 15 --start 2023-01-01
```

`--end` is exclusive and optional. When omitted, the current incomplete candle is excluded. Imports are idempotent and exit unsuccessfully when verification finds gaps.

## Backtesting

The deterministic engine enters close-generated signals at the next candle open. Stop-loss wins when stop and target both occur in one candle. Fees and adverse slippage use decimal arithmetic, and every saved run includes its configuration and a SHA-256 hash of the exact candle dataset.

The current strategy is a test fixture only; no trading strategy has been implemented yet.

## Risk and capital allocation

Every backtest entry now passes through the central decimal-safe risk evaluator. It supports fixed-margin, allocation-percentage, and stop-risk sizing; enforces leverage, notional, position-count, daily-loss, minimum-order, and allocation limits; and quantizes protective prices and quantities to instrument rules. PostgreSQL row locks serialize concurrent capital reservations, and every acceptance or rejection is persisted with its inputs and reason code.
