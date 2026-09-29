# Crypto Futures Bot — TODO

Last updated: 2026-09-30

## Current milestone: risk and capital safety

Goal: centrally size and approve every trade without exceeding configured capital or portfolio limits.

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

- [ ] Consume finalized Bybit candles from the public WebSocket.
- [ ] Backfill gaps after reconnecting.
- [ ] Reuse the strategy, risk, sizing, and order-state code from backtesting.
- [ ] Simulate live fills, fees, slippage, margin, stop-loss, and take-profit.
- [ ] Persist paper balances, orders, fills, positions, and trades.
- [ ] Recover paper state after restart.
- [ ] Add dry-run mode that records plans without changing balances.
- [ ] Add critical Telegram alerts.
- [ ] Run a multi-day paper-trading soak test.

### Milestone 6 — Bybit testnet execution

- [ ] Wrap the Bybit SDK/API behind the exchange adapter.
- [ ] Load and cache instrument metadata.
- [ ] Add centralized API rate-limit handling.
- [ ] Submit idempotent orders using deterministic client order IDs.
- [ ] Process private order, fill, position, and wallet streams.
- [ ] Handle rejected, partially filled, cancelled, and unknown orders.
- [ ] Create exchange-native reduce-only protective orders.
- [ ] Close the filled position if stop-loss creation fails.
- [ ] Reconcile balances, orders, fills, and positions at startup/reconnect.
- [ ] Prevent trading until reconciliation and readiness checks pass.
- [ ] Test crash recovery during each order state.

### Milestone 7 — operational hardening

- [ ] Add strategy assignments per exchange, symbol, and timeframe.
- [ ] Add strategy/config versioning.
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
- [ ] Frontend dashboard.
- [ ] Redis, queues, TimescaleDB, ClickHouse, microservices, or Kubernetes.

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
