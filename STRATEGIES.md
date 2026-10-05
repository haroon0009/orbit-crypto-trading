# Swing Strategy Research and Implementation Checklist

Last updated: 2026-10-02

This file tracks strategy research, implementation, validation, and deployment. Win-rate ranges are research targets, not expected returns or guarantees.

## Status

- [x] Baseline `EMA_CROSS` strategy implemented for backtesting and paper trading.
- [x] `EMA_ADX_ATR` version 1.0.0 implemented and registered for backtesting.
- [x] `DONCHIAN_ATR` version 1.0.0 implemented and registered for backtesting and paper trading.
- [x] `BB_RSI_MEAN_REVERSION` version 1.0.0 implemented and registered for backtesting and paper trading.
- [x] `BB_SQUEEZE_BREAKOUT` version 1.0.0 implemented and registered for backtesting and paper trading.
- [x] `HTF_TREND_PULLBACK` version 1.0.0 implemented and registered for backtesting and paper trading.
- [ ] No researched swing strategy below is approved for live trading yet.

## Recommended implementation order

1. EMA trend/pullback with ADX and ATR.
2. Donchian breakout with ATR trailing stop.
3. Bollinger/RSI mean reversion with a regime filter.
4. Bollinger squeeze breakout.
5. Higher-timeframe trend pullback.

## 1. EMA trend/pullback with ADX and ATR

Proposed ID: `EMA_ADX_ATR`  
Priority: highest  
Initial market: BTCUSDT and ETHUSDT  
Initial timeframe: 1 hour  
Research win-rate range: 40–55%  
Target reward/risk: 1.8–3R

Candidate rules:

- Long when EMA 20 is above EMA 50; short when EMA 20 is below EMA 50.
- Require ADX around 20–25 or higher to avoid weak trends.
- Register a setup when price pulls back to EMA 20 while remaining above EMA 50 for longs, or below EMA 50 for shorts.
- Confirm within three candles by closing beyond the setup candle high for longs or low for shorts.
- Require EMA 50 to slope in the trade direction during both setup and confirmation; cancel the setup if the trend fails.
- Place the initial stop 1.5–2 ATR from entry.
- Exit at 2–3R, with an ATR trailing stop, or after a trend reversal.
- Risk no more than 0.25–0.5% of account equity per trade during evaluation.
- Version 1.0.0 uses ADX 25, a three-candle confirmation window, a 1.5 ATR stop, a fixed 2R target, and no extra cooldown beyond the one-position limit.

Checklist:

- [x] Finalize entry, exit, ADX, ATR, and cooldown rules.
- [x] Implement indicators and strategy contract.
- [x] Add deterministic unit tests.
- [x] Add the strategy and configuration version to the database.
- [ ] Backtest BTCUSDT and ETHUSDT across bull, bear, and sideways periods.
- [ ] Complete walk-forward, cost-stress, paper, and testnet validation.

## 2. Donchian breakout with ATR trailing stop

Proposed ID: `DONCHIAN_ATR`  
Priority: high  
Initial market: BTCUSDT and ETHUSDT  
Initial timeframe: 1 hour or 4 hours  
Research win-rate range: 30–45%  
Target reward/risk: 2.5–4R

Candidate rules:

- Enter long when a candle closes above the previous 20-candle high.
- Enter short when a candle closes below the previous 20-candle low.
- Require ATR expansion, volume confirmation, or both.
- Use an initial 2.5 ATR stop and trail 2.5 ATR behind the best price.
- Apply each completed candle's trail from the next candle to avoid lookahead.
- Use a distant 10R safety target so the ATR trail normally controls exits.

Checklist:

- [x] Finalize channel length, confirmation, stop, and trailing rules.
- [x] Implement the strategy contract.
- [x] Add deterministic unit tests.
- [x] Add the strategy and configuration version to the database.
- [ ] Backtest trending and range-bound periods separately.
- [ ] Complete walk-forward, cost-stress, paper, and testnet validation.

## 3. Bollinger/RSI mean reversion

Proposed ID: `BB_RSI_MEAN_REVERSION`  
Priority: medium  
Initial market: BTCUSDT and ETHUSDT  
Initial timeframe: 1 hour  
Research win-rate range: 55–65%  
Target reward/risk: 0.8–1.5R

Candidate rules:

- Enable only in a range regime, such as ADX below 18–20.
- Long after a lower Bollinger Band rejection with oversold RSI.
- Short after an upper Bollinger Band rejection with overbought RSI.
- Target the middle band or opposite side of the range.
- Stop 1–1.5 ATR outside the range.
- Disable on confirmed volatility expansion.
- Never average down, use martingale sizing, or use grid recovery.
- Version 1.0.0 uses 20-period, 2-deviation bands; RSI 14 at 30/70; ADX 14 at or below 20; a 1 ATR stop beyond the rejected band; and the middle band as target.

Checklist:

- [x] Define the range-regime filter and breakout shutdown rule.
- [x] Implement the strategy contract.
- [x] Add deterministic unit tests, including a trend-regime rejection test.
- [x] Add the strategy and configuration version to the database.
- [ ] Stress test crash, breakout, and sustained-trend periods.
- [ ] Complete walk-forward, cost-stress, paper, and testnet validation.

## 4. Bollinger squeeze breakout

Proposed ID: `BB_SQUEEZE_BREAKOUT`  
Priority: medium-low  
Initial market: BTCUSDT and ETHUSDT  
Initial timeframe: 1 hour  
Research win-rate range: 35–50%  
Target reward/risk: 2–3R

Candidate rules:

- Detect a volatility contraction using Bollinger Band width.
- Enter only after a confirmed close outside the compressed range.
- Require volume or ATR expansion.
- Place the stop inside the broken range or 1.5–2 ATR from entry.
- Trail profitable positions rather than using a small target.
- Version 1.0.0 defines a squeeze as the bottom 20% of normalized Bollinger bandwidth over 100 observations, requires a 1.2 ATR expansion, uses a 1.5 ATR initial stop, a 2 ATR trail, and a distant 10R safety target.

Checklist:

- [x] Define squeeze percentile, breakout confirmation, and expansion rules.
- [x] Implement the strategy contract.
- [x] Add deterministic unit tests.
- [x] Add the strategy and configuration version to the database.
- [ ] Measure false breakouts and performance after fees.
- [ ] Complete walk-forward, cost-stress, paper, and testnet validation.

## 5. Higher-timeframe trend pullback

Proposed ID: `HTF_TREND_PULLBACK`  
Priority: later  
Initial market: BTCUSDT and ETHUSDT  
Initial timeframes: 4-hour regime and 1-hour entry  
Research win-rate range: 45–60%  
Target reward/risk: 1.5–2.5R

Candidate rules:

- Determine direction from the 4-hour trend.
- Enter on a 1-hour pullback in the same direction.
- Require momentum to resume before entry.
- Use an ATR-based stop beyond the pullback structure.
- Exit at a fixed R multiple, with a trailing stop, or after regime reversal.
- Version 1.0.0 builds the 4-hour regime only from completed time buckets, uses EMA 20/50 direction with EMA 50 slope, registers a 1-hour EMA 20 pullback, confirms beyond the setup candle within three bars, places the stop beyond structure with a 0.25 ATR buffer and at least 1.5 ATR risk, and targets 2R.

Checklist:

- [x] Add synchronized multi-timeframe strategy input support.
- [x] Define higher-timeframe regime and lower-timeframe entry rules.
- [x] Implement the strategy contract.
- [x] Add deterministic multi-timeframe tests.
- [x] Add the strategy and configuration version to the database.
- [ ] Complete walk-forward, cost-stress, paper, and testnet validation.

## Validation gates for every strategy

- [ ] Use chronological train, validation, and unseen test periods.
- [ ] Run rolling walk-forward tests without selecting parameters on test data.
- [ ] Include entry and exit fees, slippage, funding, and rejected/partial fills.
- [ ] Stress fees and slippage at 1.5–2 times the expected level.
- [ ] Collect at least 100–200 out-of-sample trades across supported markets.
- [ ] Require positive net expectancy after every cost.
- [ ] Target an out-of-sample profit factor of at least 1.25.
- [ ] Keep maximum drawdown at or below 15% during initial evaluation.
- [ ] Verify that nearby parameter values remain profitable.
- [ ] Verify that no single ticker produces more than half of total profit.
- [ ] Paper trade for at least 50 closed trades and multiple market regimes.
- [ ] Pass testnet execution, restart recovery, and protection-order checks.
- [ ] Require explicit approval before enabling live execution.

## Fee model

Use conservative taker execution until maker-fill simulation exists:

- Bybit baseline: 0.055% per taker fill, approximately 0.11% round trip.
- Binance baseline: 0.05% per taker fill, approximately 0.10% round trip.
- Add configurable slippage to both entry and exit.
- Add funding based on position direction, notional, funding rate, and holding period.
- Calculate every cost from notional value, not account margin.

## Research references

- [Time-series momentum and market timing in Bitcoin](https://ideas.repec.org/a/pal/risman/v28y2026i3d10.1057_s41283-026-00234-7.html)
- [The profitability of technical trading rules in the Bitcoin market](https://research-portal.uu.nl/en/publications/the-profitability-of-technical-trading-rules-in-the-bitcoin-marke/)
- [Bitcoin momentum versus mean-reversion study](https://www.theseus.fi/handle/10024/902903)
- [Community breakout/trend backtest discussion](https://www.reddit.com/r/algotradingcrypto/comments/1rvo96n/backtested_swing_trading_algo_20212026_954_trades/)
- [Community low-win-rate trend-following discussion](https://www.reddit.com/r/algotrading/comments/1unk44b/stairway_to_heaven_a_trendfollowing_breakout/)
- [Community mean-reversion research discussion](https://www.reddit.com/r/algotrading/comments/1vqbakf/mean_reversion_strategy_prospects/)
- [Bybit perpetual-contract fees](https://www.bybit.com/en/help-center/article/FAQ-USDT-Perpetual-and-Expiry-Contracts?category=4d5d8649cba144c1a8)
- [Binance USD-M futures fees](https://www.binance.com/en-BH/fee/futureFee)
