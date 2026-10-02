# Crypto Futures Bot

Private, safety-first crypto futures research and trading system. Historical ingestion and the deterministic backtest kernel are complete; live trading remains disabled.

## Development

```powershell
Copy-Item .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm db:migrate
pnpm check
pnpm dev
```

Configuration is validated at startup. `TRADING_MODE` defaults to `BACKTEST`; live mode additionally requires the exact confirmation documented in `.env.example` when live execution is implemented.

Start the React dashboard and its localhost-only API with `pnpm ui`, then open
`http://127.0.0.1:3000`. It uses React Router, shadcn/ui components, and
TradingView Lightweight Charts. The dashboard reads paper state, testnet
readiness, and recent risk decisions. The live chart receives a
transient Bybit snapshot plus forming candles through the backend; these are
not saved as historical data. Historical ticker/timeframe ranges can be added
or synced to the latest completed candle from the BackTest page. BullMQ runs
imports and backtests asynchronously through local Redis; historical candles
remain dedicated to backtesting. The dashboard cannot submit exchange orders.

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

The first production strategy is the versioned EMA 20/50 crossover. Backtests
are queued through BullMQ, load only stored candles, fail on data gaps, and
persist the same deterministic metrics and dataset hash as direct engine runs.

## Risk and capital allocation

Every backtest entry now passes through the central decimal-safe risk evaluator. It supports fixed-margin, allocation-percentage, and stop-risk sizing; enforces leverage, notional, position-count, daily-loss, minimum-order, and allocation limits; and quantizes protective prices and quantities to instrument rules. PostgreSQL row locks serialize concurrent capital reservations, and every acceptance or rejection is persisted with its inputs and reason code.

## Paper market-data feed

With `TRADING_MODE=PAPER`, consume finalized Bybit candles and automatically REST-backfill gaps after reconnects:

```powershell
pnpm paper:data -- --symbol BTCUSDT --interval 15
```

The paper engine accepts any strategy implementing the shared strategy contract. It uses the same decimal fill, fee, slippage, stop-loss, take-profit, sizing, and risk rules as backtesting. Every finalized candle atomically persists the account, orders, fills, positions, and trades; startup restores pending/open state and reconciles reserved capital. Dry-run mode records accepted plans without changing money. Set both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to enable critical alerts through `TelegramNotifier`.

No production strategy is bundled yet; integration and the three-day replay soak use deterministic fixture strategies.

## Bybit testnet adapter

Set `TRADING_MODE=TESTNET`, `BYBIT_API_KEY`, and `BYBIT_API_SECRET` to construct the testnet-only adapter. It caches current instrument rules, retries rate limits, signs V5 requests, and derives stable 36-character client order IDs from each trade intent. Mainnet order submission is not implemented.

`TestnetExecutionEngine` persists every intent before submission and reconciles wallet, orders, fills, and the one-way position at startup and after each private `order`, `execution`, `position`, or `wallet` event. Trading remains disabled while state is missing or unknown. Partial and full fills receive Bybit full-position stop-loss/take-profit protection; if protection fails, the engine writes a recoverable `CLOSING` state before submitting a reduce-only market close.
