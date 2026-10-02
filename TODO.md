# Crypto Futures Bot — TODO

Last updated: 2026-10-02

## Current milestone: operational hardening

Goal: add circuit breakers, observability, recovery procedures, and deployment safeguards.

### Decisions

- [x] Use a modular monolith.
- [x] Use TypeScript/Node.js for V1.
- [x] Use PostgreSQL for operational and historical candle data.
- [x] Start with Bybit; add Binance after the first end-to-end path works.
- [x] Start with USDT linear perpetual futures.
- [x] Keep live trading disabled during MVP development.
- [x] Use `BTCUSDT`, `15m`, 2023-01-01 to present as the first dataset.

### Milestone 1 — project foundation

- [x] Initialize Git and the Node.js/TypeScript project.
- [x] Enable TypeScript strict mode.
- [x] Add formatting, linting, typecheck, and test commands.
- [x] Add validated environment configuration.
- [x] Add Docker Compose with PostgreSQL.
- [x] Add forward-only SQL migrations.
- [x] Add structured logging.
- [x] Add CI for typecheck and tests.

### Milestone 2 — historical data

- [x] Create `instruments` and `candles` tables.
- [x] Implement the Bybit public Kline API client.
- [x] Download candles with pagination and rate-limit handling.
- [x] Normalize timestamps and decimal price/volume values.
- [x] Store candles idempotently with a unique database constraint.
- [x] Detect missing candles, duplicates, invalid intervals, and invalid OHLCV values.
- [x] Download only missing ranges on subsequent runs.
- [x] Add CLI commands to import and verify a requested range.
- [x] Add one integration test covering download, re-import, and gap detection.
- [x] Document the import and verification commands.

### Milestone 3 — deterministic backtesting

- [x] Define candle, signal, order, fill, position, and account domain types.
- [x] Build an injected simulation clock and chronological event loop.
- [x] Define the minimal strategy contract.
- [x] Add a fixture strategy used only to test the engine.
- [x] Enter on the next candle after a close-based signal.
- [x] Implement long and short simulated execution.
- [x] Implement stop-loss and take-profit handling.
- [x] Default ambiguous same-candle TP/SL outcomes to stop-first.
- [x] Model configurable fees and adverse slippage.
- [x] Persist reproducible run configuration and dataset identity.
- [x] Calculate trades, equity, drawdown, net return, expectancy, and profit factor.
- [x] Test against a small dataset with known results.

### Milestone 4 — risk and capital safety

- [x] Add decimal-safe monetary calculations.
- [x] Implement central capital allocation and reservation.
- [x] Implement fixed-amount sizing.
- [x] Implement percentage-of-allocation sizing.
- [x] Implement stop-distance risk-percentage sizing.
- [x] Enforce leverage, notional, position-count, and daily-loss limits.
- [x] Quantize price and quantity using exchange instrument rules.
- [x] Persist every accepted and rejected risk decision with a reason code.
- [x] Test that concurrent signals cannot exceed the allocation.

### Phase 4 verification

- [x] Route every backtest entry through the central risk engine.
- [x] Size positions with exact decimal arithmetic and exchange quantization.
- [x] Reserve margin plus a round-trip fee buffer.
- [x] Serialize concurrent reservations with PostgreSQL row locks.
- [x] Persist accepted and rejected decisions with reason codes.
- [x] Pass the risk, persistence, and backtest test suites.

### Milestone 5 — paper trading

- [x] Consume finalized Bybit candles from the public WebSocket.
- [x] Backfill gaps after reconnecting.
- [x] Reuse the strategy, risk, sizing, and order-state code from backtesting.
- [x] Simulate live fills, fees, slippage, margin, stop-loss, and take-profit.
- [x] Persist paper balances, orders, fills, positions, and trades.
- [x] Recover paper state after restart.
- [x] Add dry-run mode that records plans without changing balances.
- [x] Add critical Telegram alerts.
- [x] Run an automated three-day paper-trading replay soak test.

### Milestone 6 — Bybit testnet execution

- [x] Wrap the Bybit SDK/API behind the exchange adapter.
- [x] Load and cache instrument metadata.
- [x] Add centralized API rate-limit handling.
- [x] Submit idempotent orders using deterministic client order IDs.
- [x] Process private order, fill, position, and wallet streams.
- [x] Handle rejected, partially filled, cancelled, and unknown orders.
- [x] Create exchange-native reduce-only protective orders.
- [x] Close the filled position if stop-loss creation fails.
- [x] Reconcile balances, orders, fills, and positions at startup/reconnect.
- [x] Prevent trading until reconciliation and readiness checks pass.
- [x] Test crash recovery during each order state.

### Milestone 7 — operational hardening

- [x] Add a React Router dashboard with shadcn/ui components.
- [x] Stream forming Bybit candles to the dashboard through the backend.
- [x] Keep live chart candles transient and reserve stored history for backtests.
- [x] Add historical ticker/timeframe import controls to the BackTest page.
- [x] Move historical imports and strategy backtests to BullMQ workers.
- [x] Add per-dataset resync through the latest completed candle.
- [x] Add strategy assignments per exchange, symbol, and timeframe.
- [x] Add strategy/config versioning.
- [x] Separate strategy lifecycle management from full bot CRUD.
- [x] Align bot/backtest options and derive ticker timeframes from downloaded data.
- [x] Separate backtest/live analytics and add detailed run charts and trade logs.
- [ ] Add stale-data and exchange-divergence circuit breakers.
- [ ] Add manual kill switch and explicit live-mode confirmation.
- [ ] Add health/readiness checks, metrics, dashboards, and alerts.
- [ ] Add database backup and restore procedures.
- [ ] Add graceful shutdown without cancelling protective orders.
- [ ] Compare backtest and paper-trading performance.
- [ ] Write deployment, recovery, and incident runbooks.

### Deferred until justified

- [ ] Binance adapter.
- [ ] Python research workspace.
- [ ] Parquet dataset exports.
- [ ] Funding-rate ingestion and modeling.
- [ ] Lower-timeframe intrabar simulation.
- [ ] Partial take profits and trailing stops.
- [ ] Multiple simultaneous strategies per symbol.
- [ ] Interactive strategy configuration and trade controls in the dashboard.
- [ ] TimescaleDB, ClickHouse, microservices, or Kubernetes.

## Completed historical foundation checks

- [x] A requested Bybit candle range can be downloaded with one command.
- [x] Re-running the command creates no duplicates or downloads.
- [x] Missing or invalid candles are reported clearly.
- [x] Prices and volumes round-trip without floating-point corruption.
- [x] Tests and typecheck pass.
- [x] No API credentials or trading permissions are required.
- [x] `BTCUSDT` 15-minute history from 2023-01-01 is stored with zero gaps.

## Completed deterministic backtest checks

- [x] A signal cannot enter before the following candle opens.
- [x] Long and short fills use exact decimal arithmetic.
- [x] Same-candle stop/target ambiguity resolves to stop-loss.
- [x] Fees, adverse slippage, and end-of-data closure are explicit configuration.
- [x] Run configuration and the exact candle dataset hash are persisted.
- [x] A known two-trade fixture produces the expected PnL and drawdown.

## Completed paper-trading checks

- [x] Finalized live candles are stored once and reconnect gaps are backfilled.
- [x] Backtesting and paper trading share fill, fee, slippage, and protective-exit rules.
- [x] Paper balances, orders, fills, positions, and trades persist atomically per candle.
- [x] Pending orders and open positions recover after restart.
- [x] Capital reservations reconcile after a crash and never exceed current balance.
- [x] Dry-run plans persist without changing balances or opening positions.
- [x] Critical risk and stop-loss events can emit Telegram alerts.
- [x] A three-day finalized-candle replay survives daily restarts with unchanged state.

## Completed Bybit testnet checks

- [x] All authenticated REST calls are signed and restricted to Bybit testnet.
- [x] Private order, execution, position, and wallet events trigger serialized reconciliation.
- [x] Wallet, orders, fills, and positions are reconciled before readiness is enabled.
- [x] Partial fills receive full-position exchange-native stop-loss and take-profit protection.
- [x] Protection failure writes recovery state before submitting a reduce-only emergency close.
- [x] Rejected, cancelled, missing, and unknown orders cannot be resubmitted unsafely.
- [x] Planned, submitted, partial, protected, closing, closed, and unknown crash states recover deterministically.
- [x] Unsupported hedge-mode positions block execution.
