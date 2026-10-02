# MASTER PROMPT: BUILD A PRODUCTION-GRADE CRYPTO FUTURES TRADING BOT

You are acting as my:

- Senior Quantitative Trading Systems Engineer
- Crypto Futures Trading Bot Architect
- Backend/Infrastructure Architect
- Risk Management Engineer
- Data Engineer
- DevOps Engineer
- Technical Product Advisor

Your responsibility is to help me architect and build a modular, reliable, testable, high-performance crypto futures trading system from scratch.

Do NOT jump immediately into coding everything.

First understand the requirements, analyze feasibility, propose the architecture, identify risks, define project phases, establish the repository structure, and then guide me through implementation step by step.

---

# 1. ABOUT ME

I am a software engineer with 7+ years of professional Node.js experience.

I am strongest in:

- Node.js
- TypeScript / JavaScript
- REST APIs
- Backend architecture
- Databases
- Web applications
- API integrations

I am comfortable learning and using another language where it provides a meaningful technical advantage.

I am open to technologies such as:

- Python
- Rust
- Go
- C++
- TimescaleDB
- PostgreSQL
- Redis
- ClickHouse
- Kafka
- Docker
- Kubernetes

However, do NOT introduce another technology just because it is popular.

Prefer technologies based on:

1. reliability
2. maintainability
3. execution speed
4. developer productivity
5. exchange/library ecosystem
6. historical-data processing performance
7. ability to backtest strategies accurately
8. operational simplicity

Node.js/TypeScript should remain the default when there is no significant benefit from another language.

If Python would significantly improve strategy research, numerical computation, optimization, backtesting, or machine-learning capabilities, explain exactly where it should be introduced.

A hybrid architecture is acceptable.

For example:

TypeScript:
- API
- orchestration
- exchange integration
- live execution engine
- WebSocket handling
- application services

Python:
- quantitative research
- backtesting
- strategy optimization
- statistical analysis

But recommend the architecture only after evaluating the tradeoffs.

---

# 2. PRIMARY OBJECTIVE

Build a crypto FUTURES trading platform capable of:

1. Historical strategy backtesting
2. Paper trading using live market data
3. Live futures trading eventually
4. Risk management
5. Position sizing
6. Take Profit management
7. Stop Loss management
8. Multiple trading strategies
9. Strategy activation/deactivation
10. Strategy configuration per ticker
11. Trade history storage
12. Market-data storage
13. Backtest analytics
14. Paper-trading analytics
15. Live-trading analytics
16. Notifications and alerts
17. Exchange connectivity
18. Account/balance monitoring
19. Performance reporting
20. Future extensibility

The architecture should support eventually running this continuously as a production service.

---

# 3. IMPORTANT DEVELOPMENT PHILOSOPHY

We will develop this system progressively.

The expected progression is:

PHASE 1
Architecture and technical design

PHASE 2
Project infrastructure

PHASE 3
Historical data ingestion

PHASE 4
Backtesting engine

PHASE 5
Strategy framework

PHASE 6
Risk-management engine

PHASE 7
Paper-trading engine

PHASE 8
Analytics

PHASE 9
Exchange integration

PHASE 10
Live trading with extremely limited capital

PHASE 11
Monitoring, observability and operational hardening

Do NOT skip directly to live trading.

The same strategy should ideally work through:

Strategy
    ↓
Backtesting Engine
    ↓
Paper Trading Engine
    ↓
Live Trading Engine

without duplicating strategy logic.

The strategy layer should not need to know whether it is executing against:

- historical data
- paper trading
- real trading

Design suitable abstractions/interfaces for this.

---

# 4. TRADING MARKET

The system will primarily trade:

CRYPTO FUTURES

Initially we will probably integrate one major exchange.

Possible examples include:

- Binance Futures
- Bybit
- OKX

But do NOT assume which one should be used.

Research the latest official APIs/documentation when necessary and recommend the most appropriate initial exchange based on:

- API quality
- WebSocket reliability
- testnet/demo support
- futures support
- API rate limits
- historical-data availability
- order types
- documentation
- Node.js/Python SDK maturity
- geographic/API restrictions
- fees
- operational reliability

Do not rely on outdated assumptions.

Use official exchange documentation as the primary source.

The exchange implementation must be abstracted so another exchange can later be added without rewriting the trading system.

Example conceptual interface:

ExchangeAdapter

Methods such as:

getBalance()
getTicker()
getOrderBook()
getCandles()
getPositions()
placeOrder()
cancelOrder()
getOrderStatus()
setLeverage()
setMarginMode()
closePosition()
subscribeTrades()
subscribeOrderBook()
subscribeCandles()
subscribeUserOrders()
subscribePositions()

Actual interface design is your responsibility.

---

# 5. CORE TRADING REQUIREMENTS

The user should be able to select:

- exchange
- ticker
- strategy
- timeframe
- allocated trading capital
- leverage
- margin configuration where applicable
- risk-to-reward ratio
- strategy parameters

Example:

Ticker:
BTCUSDT

Strategy:
EMA_CROSSOVER

Timeframe:
15m

Allocated Capital:
$1,000

Risk Reward:
1:1.5

Leverage:
3x

Enabled:
true

---

# 6. CAPITAL ALLOCATION — CRITICAL REQUIREMENT

I will configure an amount of capital that the bot is allowed to use.

Example:

Account balance:
$10,000

Bot allocation:
$2,000

The bot MUST NOT exceed the configured trading allocation.

This requirement must be enforced centrally by the risk-management system rather than individually inside strategies.

Consider:

- available balance
- reserved capital
- open-position exposure
- pending-order exposure
- leverage
- fees
- funding
- unrealized PnL
- margin requirements

The engine should prevent accidental over-allocation.

Use decimal-safe monetary arithmetic.

Do not rely carelessly on JavaScript floating-point arithmetic for financial calculations.

Evaluate libraries such as Decimal.js or another appropriate mechanism.

---

# 7. RISK-TO-REWARD MANAGEMENT

Default risk/reward ratio:

1 : 1.5

But it must be configurable.

Examples:

1:1
1:1.5
1:2
1:3

Strategies may generate an entry and stop-loss condition.

The trade/risk engine should be able to calculate the appropriate take-profit price according to the configured risk/reward ratio where appropriate.

Example:

LONG

Entry:
100

Stop:
98

Risk:
2

Risk Reward:
1:1.5

Target:
103

The architecture must support both:

LONG

and

SHORT

positions.

Risk/reward logic must work correctly for both directions.

---

# 8. POSITION SIZING

Do not simply use the entire allocated balance for every trade.

Build a proper PositionSizingService.

Eventually I want configurable models such as:

FIXED_AMOUNT

Example:
$100 per trade

PERCENT_OF_ALLOCATED_BALANCE

Example:
10%

RISK_PERCENTAGE

Example:
Risk 1% of allocated equity based on stop-loss distance.

VOLATILITY_ADJUSTED

Potential future feature.

Every position-sizing result should respect global limits.

---

# 9. TAKE PROFIT AND STOP LOSS

Every live trade should normally have risk protection.

Support concepts such as:

- stop loss
- take profit
- configurable R:R
- exchange-native protective orders where appropriate
- reduce-only orders
- position closing
- partial take profits in the future
- trailing stops in the future

The system must explicitly address what happens if:

1. Entry succeeds but TP creation fails
2. Entry succeeds but SL creation fails
3. API connection is lost
4. Bot crashes
5. WebSocket disconnects
6. Exchange rejects an order
7. Position exists at exchange but local database disagrees
8. Orders are partially filled

For dangerous scenarios, prefer fail-safe behavior.

Production trading architecture must account for recovery after application restart.

---

# 10. STRATEGY ENGINE

We will create multiple strategies over time.

Examples may eventually include:

- EMA crossover
- EMA + RSI
- breakout
- Bollinger Bands
- MACD
- momentum
- support/resistance
- trend following
- mean reversion
- volume-based strategies

DO NOT implement these yet unless specifically requested.

First build the strategy framework.

Each strategy should implement a common contract.

Conceptually:

Strategy {
    initialize()
    onCandle()
    onTick()
    generateSignal()
    getRequiredIndicators()
    validateConfig()
}

Possible output:

Signal {
    strategyId
    symbol
    timeframe
    direction
    entryPrice
    stopLoss
    confidence?
    metadata
    timestamp
}

But critically evaluate this model rather than blindly implementing it.

A strategy SHOULD NOT directly send orders to an exchange.

Preferred conceptual flow:

Market Data
      ↓
Strategy
      ↓
Signal
      ↓
Signal Validator
      ↓
Risk Engine
      ↓
Position Sizing
      ↓
Trade Plan
      ↓
Execution Engine
      ↓
Exchange Adapter

Keep responsibilities separated.

---

# 11. STRATEGY ENABLE / DISABLE

I should be able to enable or disable strategies dynamically.

Examples:

BTCUSDT:
    EMA_CROSSOVER: ENABLED
    BREAKOUT: DISABLED

ETHUSDT:
    EMA_CROSSOVER: DISABLED
    BREAKOUT: ENABLED

A strategy should therefore support configuration per:

exchange + ticker + timeframe

Potential model:

StrategyAssignment

- id
- strategyId
- exchange
- symbol
- timeframe
- enabled
- parameters
- riskConfig
- capitalAllocation
- createdAt
- updatedAt

Design the actual database schema.

---

# 12. BACKTESTING ENGINE

This is one of the most important parts of the system.

Before trading real money, I want to test strategies against historical market data.

The backtester should eventually support:

- multiple tickers
- multiple timeframes
- configurable date ranges
- strategy parameters
- long trades
- short trades
- stop loss
- take profit
- fees
- leverage
- slippage
- funding fees where relevant
- starting capital
- position sizing
- capital allocation
- realistic fills
- configurable execution assumptions

Avoid unrealistic backtests.

We need to carefully prevent:

- look-ahead bias
- survivorship bias where relevant
- future-data leakage
- indicator warm-up problems
- unrealistic order fills
- candle ambiguity
- incorrect intrabar TP/SL assumptions
- ignoring fees
- ignoring spread/slippage

For candle backtests, explicitly handle situations where both TP and SL appear inside the same OHLC candle.

Do not arbitrarily assume the profitable event happened first.

Define configurable or conservative fill assumptions.

---

# 13. HISTORICAL MARKET DATA

Design a historical data subsystem.

Possible data:

OHLCV

- open time
- open
- high
- low
- close
- volume
- close time

Potentially later:

- trades
- order book snapshots
- funding rates
- open interest
- liquidation data

For MVP, candles are probably sufficient.

Determine:

- where historical data comes from
- how it is downloaded
- storage format
- indexing strategy
- duplicate detection
- missing-candle detection
- integrity checks
- resampling if appropriate
- pagination
- API rate limits

Evaluate storing large historical datasets in:

PostgreSQL
TimescaleDB
ClickHouse
Parquet
or a hybrid

Recommend what makes sense for this project.

Do not over-engineer the MVP.

---

# 14. BACKTEST ANALYTICS

For each backtest, calculate and persist metrics such as:

- total trades
- winning trades
- losing trades
- win rate
- gross profit
- gross loss
- net profit
- fees
- funding fees if modeled
- average win
- average loss
- largest win
- largest loss
- profit factor
- expectancy
- max drawdown
- max drawdown percentage
- return percentage
- risk/reward realized
- consecutive wins
- consecutive losses
- average holding duration
- exposure
- long performance
- short performance

Also evaluate whether to support:

- Sharpe ratio
- Sortino ratio
- Calmar ratio

Explain which metrics are appropriate for futures strategies and their limitations.

Generate:

- equity curve
- drawdown curve
- trade list
- performance summary
- monthly returns where useful

---

# 15. PAPER TRADING

After a strategy performs acceptably in historical testing, I want to run it against LIVE market data without risking money.

Paper trading should consume real-time exchange data.

It should simulate:

- order execution
- fills
- SL
- TP
- fees
- slippage
- margin
- leverage
- account balance
- positions
- PnL

Store all simulated trades permanently.

Architecture should allow the same analytics engine to analyze:

BACKTEST

PAPER

LIVE

trading results.

Prefer a common normalized trade model.

---

# 16. LIVE MARKET DATA

Use WebSockets where appropriate for real-time market data.

Support:

- reconnection
- heartbeat
- connection status
- stale-data detection
- exponential backoff
- subscription restoration
- duplicate-event handling
- message ordering where relevant

Potential streams:

- candles
- ticker
- trades
- order book
- user orders
- account updates
- position updates

For strategies based on candle close, prevent accidentally generating multiple signals for the same closed candle.

---

# 17. EXECUTION ENGINE

Create an ExecutionEngine responsible for converting approved trade plans into exchange orders.

It should understand:

- market orders
- limit orders
- order status
- partial fills
- cancellations
- rejected orders
- retries
- idempotency
- reduce-only
- TP orders
- SL orders

Every client order should have an internally generated unique ID where supported.

Do not blindly retry order creation because duplicate orders could create unexpected exposure.

Explain safe retry semantics.

---

# 18. STATE RECONCILIATION

The database cannot blindly be treated as truth.

The exchange ultimately determines real positions and real orders.

Create a reconciliation system.

It should periodically compare:

LOCAL STATE

with

EXCHANGE STATE

Including:

- open positions
- open orders
- balances
- filled orders

Differences should generate alerts and safe corrective behavior.

Also reconcile state at application startup before new orders are allowed.

---

# 19. LOW BALANCE MANAGEMENT

If available balance becomes too low, the bot should notify me.

However, do NOT allow an AI or arbitrary heuristic to recklessly decide how to trade additional money.

Build deterministic risk rules.

Examples:

If available trading capital < configured minimum:

1. prevent new positions
2. continue protecting existing positions
3. send an alert
4. record the reason
5. optionally close positions only if explicitly configured by predefined rules

Potential states:

NORMAL
LOW_BALANCE
TRADING_PAUSED
RISK_LOCKED
EMERGENCY

Design a proper finite-state model if useful.

---

# 20. CIRCUIT BREAKERS

Implement global safety controls.

Examples:

Maximum:

- position value
- number of simultaneous positions
- leverage
- exposure per symbol
- total portfolio exposure
- loss per trade
- daily loss
- daily drawdown
- consecutive losses

Potential controls:

maxDailyLossPercent
maxOpenPositions
maxRiskPerTrade
maxPortfolioExposure
maxLeverage
maxConsecutiveLosses

Example:

If daily loss exceeds configured threshold:

TRADING_DISABLED

Existing risk protection remains active.

New trades are prevented.

Require manual or explicitly defined reset behavior.

---

# 21. KILL SWITCH

Create a global trading kill switch.

When triggered:

- no new trades
- cancel eligible pending entry orders
- continue monitoring existing exposure
- preserve protective SL/TP orders

Have separate clearly defined actions for:

PAUSE_NEW_TRADES

and

EMERGENCY_CLOSE_ALL

because they are not the same thing.

Emergency closing should never happen merely because a monitoring component failed unless explicitly configured.

---

# 22. DATABASE

We need persistent storage for:

- users/config if required
- exchanges
- API credential references
- symbols
- strategy definitions
- strategy assignments
- strategy configuration
- historical candles
- backtest runs
- backtest trades
- paper-trading sessions
- paper trades
- live trades
- orders
- fills
- positions
- balances
- signals
- trade plans
- risk decisions
- bot events
- errors
- notifications
- system configuration
- audit logs

Recommend an appropriate database architecture.

My initial preference is:

PostgreSQL

Potentially with:

TimescaleDB

and Redis where genuinely useful.

But evaluate this.

---

# 23. REDIS

Determine whether Redis is useful for:

- caching
- distributed locks
- rate limiting
- ephemeral bot state
- queues
- pub/sub
- worker coordination

Do not add Redis unless there is a clear reason.

Persistent trading state must not exist only in Redis.

---

# 24. EVENT-DRIVEN ARCHITECTURE

Evaluate an event-driven design.

Possible events:

MarketDataReceived
CandleClosed
SignalGenerated
SignalRejected
TradePlanCreated
RiskApproved
RiskRejected
OrderSubmitted
OrderAccepted
OrderRejected
OrderPartiallyFilled
OrderFilled
PositionOpened
StopLossTriggered
TakeProfitTriggered
PositionClosed
BalanceLow
CircuitBreakerTriggered

Determine whether we need:

- in-process EventEmitter
- Redis Streams
- RabbitMQ
- NATS
- Kafka

For MVP, prefer simplicity unless distributed infrastructure provides a strong advantage.

Avoid Kafka just because it is technically impressive.

---

# 25. API

Create a backend API so that eventually a dashboard can control the bot.

Potential operations:

GET /symbols

GET /strategies

POST /strategies

PATCH /strategies/:id

POST /backtests

GET /backtests

GET /backtests/:id

GET /backtests/:id/trades

POST /paper-sessions

POST /paper-sessions/:id/start

POST /paper-sessions/:id/stop

GET /positions

GET /orders

GET /trades

GET /risk/status

POST /trading/pause

POST /trading/resume

POST /trading/emergency-stop

Do not blindly implement these exact endpoints.

Design a clean API.

---

# 26. DASHBOARD

Not required in the first implementation but keep architecture compatible with a future dashboard.

Possible stack:

Next.js
React
TypeScript

Dashboard could display:

BOT STATUS

BALANCE

ALLOCATED CAPITAL

AVAILABLE CAPITAL

OPEN POSITIONS

ORDERS

ACTIVE STRATEGIES

PAPER TRADING

BACKTESTS

EQUITY CURVES

PNL

DRAWDOWN

WIN RATE

RISK STATE

SYSTEM HEALTH

---

# 27. NOTIFICATIONS

Create a notification abstraction.

Potential notification channels:

- Telegram
- Discord
- email
- Slack

Telegram may be the easiest initial option.

Events worth notifying:

- bot started
- bot stopped
- trade opened
- trade closed
- SL hit
- TP hit
- order rejected
- insufficient balance
- daily loss limit reached
- API disconnected
- reconciliation mismatch
- critical exception
- circuit breaker activated

Avoid flooding notification channels with every tick.

Support notification severity:

INFO
WARNING
CRITICAL

---

# 28. EXCHANGE API KEYS

Security is critical.

Do NOT store API secrets directly in source code.

Use:

- environment variables during local development
- Docker secrets / secret manager for deployment
- encrypted secrets where appropriate

Exchange API key should ideally have:

- trading permission
- NO withdrawal permission

Document best practices.

Never log API secrets.

Sanitize exceptions and request logs.

---

# 29. TEST ENVIRONMENTS

Before live trading:

1. unit tests
2. integration tests
3. historical backtesting
4. exchange sandbox/testnet if available
5. live-data paper trading
6. extremely limited real capital
7. gradual scaling

Make these stages explicit.

---

# 30. TESTING

I want serious automated testing.

Use appropriate tools such as:

Vitest
Jest
Pytest

depending on stack.

Test:

- indicator calculations
- signal generation
- position sizing
- R:R calculations
- long trade math
- short trade math
- leverage
- fees
- PnL
- SL
- TP
- capital allocation
- risk limits
- order lifecycle
- partial fills
- backtesting
- duplicate events
- exchange failures
- WebSocket reconnect
- reconciliation
- decimal precision

For every critical financial formula, create deterministic tests.

---

# 31. TIME HANDLING

All backend timestamps should use UTC.

Avoid local timezone logic inside trading algorithms.

Candles must be aligned correctly to exchange timestamps.

Prevent duplicated or skipped candles caused by timezone mistakes.

---

# 32. NUMERIC PRECISION

This is extremely important.

Account for exchange-specific:

- tick size
- quantity step
- minimum order quantity
- minimum notional
- precision
- contract specifications

Create a normalization layer.

Example:

normalizePrice()

normalizeQuantity()

validateMinNotional()

Do not assume every ticker uses identical precision.

---

# 33. LEVERAGE

Support futures leverage but make it centrally controlled.

A strategy should not arbitrarily increase leverage.

Configuration may include:

maxLeverage

Example:

strategy asks for 10x

system max:
3x

Result:
REJECTED

or constrained according to predefined rules.

Explain the safest design.

---

# 34. MARGIN

Consider futures concepts such as:

- isolated margin
- cross margin
- liquidation risk
- maintenance margin
- funding rates
- leverage

Initially determine whether isolated margin is operationally safer/simpler for automated strategies.

Explain tradeoffs rather than assuming.

---

# 35. OBSERVABILITY

Implement structured logging.

Consider:

Pino

or an appropriate alternative.

Logs should contain useful context:

timestamp
level
service
symbol
strategyId
tradeId
orderId
exchange
event

Eventually consider:

- Prometheus
- Grafana
- OpenTelemetry
- Sentry

Do not require all of them for MVP.

Recommend staged observability.

---

# 36. DOCKER

The project should be containerizable.

Provide:

Dockerfile

docker-compose.yml

Development environment may include:

bot
postgres
redis if needed

Eventually deployment could be:

VPS
AWS
GCP
DigitalOcean
Hetzner
Fly.io
or another appropriate provider.

Evaluate hosting based on:

- uptime
- network reliability
- location relative to exchange infrastructure
- cost
- Docker support
- monitoring
- latency

Do not optimize for microsecond latency unless our strategies actually require it.

---

# 37. REPOSITORY ARCHITECTURE

Evaluate whether a TypeScript monorepo makes sense.

Possible architecture:

apps/
  api/
  worker/
  backtester/
  paper-trader/
  executor/

packages/
  core/
  exchange/
  strategies/
  risk/
  indicators/
  database/
  analytics/
  notifications/
  config/
  logger/

Potentially use:

pnpm workspaces
Turborepo

But do not introduce unnecessary complexity.

Another acceptable starting point could be a modular monolith.

I strongly prefer beginning with a modular monolith if it can later be separated into services.

Explain your recommendation.

---

# 38. DOMAIN MODEL

Think carefully about core domain entities.

Potential examples:

Exchange
Symbol
Candle
Strategy
StrategyVersion
StrategyConfig
StrategyAssignment
Signal
TradePlan
Order
Fill
Position
Trade
Portfolio
Balance
RiskDecision
Backtest
BacktestTrade
PaperSession
TradingSession
Notification
AuditEvent

Define boundaries carefully.

Signal != Order.

Order != Trade.

Fill != Order.

Position != Trade.

Clearly explain these distinctions.

---

# 39. STRATEGY VERSIONING

Backtest results must remain reproducible.

If a strategy changes, we must know which code/configuration produced each historical result.

Design strategy/config versioning.

At minimum save:

strategy identifier
strategy version
strategy parameters
git commit hash where practical
dataset version/date range
execution assumptions
fees
slippage
capital
R:R configuration

A backtest must be reproducible later.

---

# 40. DATA LINEAGE

For each backtest record:

- exchange
- symbol
- timeframe
- start timestamp
- end timestamp
- data source
- number of candles
- missing candle count
- strategy version
- parameters
- fee assumptions
- slippage assumptions

This will help prevent misleading comparisons.

---

# 41. FUTURE STRATEGY OPTIMIZATION

Architecture should eventually support parameter sweeps.

Example:

EMA fast:
5, 9, 12, 20

EMA slow:
20, 26, 50, 100

R:R:
1.0, 1.5, 2.0, 3.0

But avoid selecting the historically best combination blindly.

Discuss:

- overfitting
- train/test split
- walk-forward analysis
- out-of-sample testing
- parameter sensitivity
- Monte Carlo analysis where appropriate

Do NOT optimize solely for highest historical return.

---

# 42. FUTURE MULTI-STRATEGY SUPPORT

Eventually multiple strategies could send signals simultaneously.

We need policies for:

- conflicting LONG/SHORT signals
- multiple strategies entering the same symbol
- combined exposure
- strategy-level capital allocation
- portfolio-level capital allocation

Do not solve this using arbitrary AI decisions.

Use explicit deterministic rules.

---

# 43. LIVE TRADING MUST BE DISABLED BY DEFAULT

Critical requirement:

Production/live trading should be impossible accidentally.

Configuration should default to something conceptually like:

TRADING_MODE=BACKTEST

Available modes:

BACKTEST
PAPER
TESTNET
LIVE

LIVE should require deliberate configuration.

Potential safeguards:

TRADING_MODE=LIVE
LIVE_TRADING_CONFIRMATION=I_UNDERSTAND_REAL_MONEY_IS_AT_RISK

Do not hardcode this exact implementation if you have a better design, but maintain equivalent safety.

---

# 44. DRY RUN MODE

Create a mode where the entire real-time pipeline executes except order submission.

Example:

Signal
↓
Risk
↓
Trade Plan
↓
Simulated Execution Log

This will help diagnose behavior before enabling real order placement.

---

# 45. AUDITABILITY

Every important decision should be explainable afterward.

For every rejected trade, save a reason.

Examples:

INSUFFICIENT_BALANCE

MAX_DAILY_LOSS_REACHED

MAX_POSITION_LIMIT

STRATEGY_DISABLED

INVALID_STOP_LOSS

DUPLICATE_SIGNAL

STALE_MARKET_DATA

MAX_LEVERAGE_EXCEEDED

MIN_NOTIONAL_FAILED

For every accepted trade, store relevant decision inputs.

---

# 46. PERFORMANCE

The bot should be efficient but optimize according to actual requirements.

For candle-based strategies running on:

1m
5m
15m
1h

Node.js should likely be more than sufficient.

If we later implement:

- tick-level strategies
- order-book strategies
- very high-frequency systems

reevaluate architecture.

Do not prematurely build an HFT system.

---

# 47. ERROR HANDLING

Define typed/domain errors.

Examples:

ExchangeError
RateLimitError
InsufficientBalanceError
OrderRejectedError
InvalidQuantityError
RiskRejectedError
StaleMarketDataError
ReconciliationError

Do not swallow critical exceptions.

Categorize:

RETRYABLE

NON_RETRYABLE

CRITICAL

---

# 48. RATE LIMITS

Exchange APIs have rate limits.

Create centralized rate-limit awareness.

Avoid individual modules hammering the API independently.

Prefer WebSockets for appropriate live updates.

Cache exchange metadata such as precision filters rather than retrieving it before every trade.

---

# 49. SYSTEM STARTUP

Design a safe startup sequence.

Potential sequence:

1. load configuration
2. validate environment
3. connect database
4. initialize exchange adapter
5. load exchange metadata
6. authenticate
7. reconcile balances/orders/positions
8. load strategy assignments
9. initialize risk engine
10. establish market-data streams
11. verify data freshness
12. enable signal generation
13. allow execution only after readiness checks pass

A failed readiness check should prevent new live trades.

---

# 50. GRACEFUL SHUTDOWN

Handle:

SIGINT
SIGTERM

Shutdown sequence should consider:

- stop generating signals
- stop creating orders
- flush persistence
- close streams
- stop workers

Do NOT cancel protective exchange-native SL/TP orders accidentally during shutdown.

---

# 51. CRASH RECOVERY

When application restarts, it should identify:

- existing exchange positions
- existing orders
- partially filled orders
- locally pending orders

Then reconcile them before resuming.

Never assume memory state survived.

---

# 52. IDEMPOTENCY

Protect against duplicate signals/orders caused by:

- reconnects
- retries
- duplicated events
- application restart
- concurrent workers

Design appropriate idempotency keys.

For example, signal identity may include:

strategy
strategy version
symbol
timeframe
candle close timestamp

But choose the appropriate design.

---

# 53. CONCURRENCY

Prevent race conditions such as two simultaneous trade signals consuming the same capital allocation.

Potential approaches:

- database transactions
- row locks
- optimistic locking
- distributed locking

Choose the simplest reliable mechanism.

---

# 54. ANALYTICS COMPARISON

I eventually want to compare:

Strategy A

vs

Strategy B

on:

BTCUSDT
ETHUSDT

for:

30 days
90 days
1 year
3 years

and compare:

Net Return
Drawdown
Win Rate
Profit Factor
Expectancy
Number of Trades
Sharpe/Sortino where meaningful

Architecture should support this.

---

# 55. PAPER VS BACKTEST VS LIVE COMPARISON

Eventually create reports comparing:

BACKTEST EXPECTED PERFORMANCE

vs

PAPER PERFORMANCE

vs

LIVE PERFORMANCE

This will help detect:

- slippage differences
- latency effects
- execution differences
- strategy degradation
- changing market conditions

---

# 56. FIRST TECHNOLOGY DECISION

Before coding, give me a recommendation between:

OPTION A

100% TypeScript / Node.js

OPTION B

Node.js/TypeScript trading platform + Python research/backtesting

OPTION C

Python-centric system

OPTION D

another architecture

Use my 7+ years of Node.js experience as an important factor.

Compare:

- speed of development
- runtime performance
- quantitative ecosystem
- exchange integration
- numerical performance
- maintainability
- complexity
- deployment
- testing
- future extensibility

Then recommend a design based on engineering requirements.

---

# 57. POSSIBLE TECHNOLOGIES TO ASSESS

Evaluate, but do not automatically choose:

Runtime:
- Node.js
- Python

Node:
- TypeScript
- Fastify
- NestJS
- Express

Python:
- FastAPI
- pandas
- Polars
- NumPy
- vectorbt
- Backtrader
- custom event-driven engine

Database:
- PostgreSQL
- TimescaleDB
- ClickHouse

ORM:
- Prisma
- Drizzle
- TypeORM
- SQLAlchemy

Cache:
- Redis

Queues:
- BullMQ
- Redis Streams
- NATS
- RabbitMQ

Testing:
- Vitest
- Jest
- Pytest

Infrastructure:
- Docker
- Docker Compose
- GitHub Actions

Monitoring:
- Pino
- Sentry
- Prometheus
- Grafana
- OpenTelemetry

Frontend:
- Next.js
- React
- Tailwind

Exchange libraries:
Evaluate official SDKs versus CCXT versus custom REST/WebSocket clients.

Do not rely blindly on CCXT.

Discuss when official APIs provide advantages.

---

# 58. ACCOUNTS / EXTERNAL SERVICES NEEDED

Provide a list of services/accounts we will eventually need.

Separate them into:

REQUIRED FOR DEVELOPMENT

REQUIRED FOR PAPER/TESTNET

REQUIRED FOR LIVE

OPTIONAL

Potential examples:

GitHub

Docker

Crypto exchange account

Exchange API access

Exchange testnet/demo account

Telegram Bot

Hosting/VPS provider

PostgreSQL provider if managed

Sentry

Grafana

Domain name

Cloud secret manager

Do not tell me to create unnecessary paid accounts during Phase 1.

---

# 59. COST ESTIMATE

Estimate approximate infrastructure costs for:

LOCAL DEVELOPMENT

EARLY PAPER TRADING

SMALL LIVE DEPLOYMENT

LARGER MULTI-STRATEGY DEPLOYMENT

Keep infrastructure inexpensive initially.

Avoid enterprise services unless needed.

---

# 60. PROJECT TIMELINE

Provide a realistic development timeline for a single experienced backend developer.

Break estimates into:

Architecture
Infrastructure
Historical data
Backtesting
Strategy framework
Risk engine
Paper trading
Analytics
Exchange integration
Testnet
Live-readiness
Monitoring
Dashboard

Give ranges rather than pretending exact timelines are certain.

Differentiate:

MVP

PRODUCTION-CAPABLE V1

ADVANCED PLATFORM

---

# 61. DEVELOPMENT PROCESS

For every implementation phase:

1. Explain what we are building
2. Explain why
3. Define acceptance criteria
4. Show affected modules
5. Show database changes
6. Implement code
7. Add tests
8. Run tests
9. Review failure scenarios
10. Document what was implemented

Do not dump hundreds of files without explanation.

Build incrementally.

---

# 62. CODING STANDARDS

Use:

TypeScript strict mode

Prefer:

- dependency injection where useful
- explicit interfaces
- domain boundaries
- typed configuration
- schema validation
- immutable DTOs where useful
- structured logging
- consistent error handling

Avoid:

any

unless absolutely necessary.

Use:

Zod

or equivalent for external input validation if appropriate.

---

# 63. CONFIGURATION

Create typed environment configuration.

Conceptual variables:

NODE_ENV

TRADING_MODE

DATABASE_URL

REDIS_URL

EXCHANGE

EXCHANGE_API_KEY

EXCHANGE_API_SECRET

DEFAULT_RISK_REWARD

MAX_DAILY_LOSS

MAX_OPEN_POSITIONS

DEFAULT_LEVERAGE

LOG_LEVEL

But determine the final configuration model.

Validate required environment variables during startup.

---

# 64. DOCUMENTATION

Maintain:

README.md

docs/architecture.md

docs/backtesting.md

docs/risk-management.md

docs/exchange-integration.md

docs/deployment.md

docs/operations.md

docs/strategy-development.md

When architecture decisions are important, consider ADRs:

docs/adr/

Example:

ADR-001-language-and-runtime.md

ADR-002-database.md

ADR-003-exchange-abstraction.md

---

# 65. STRATEGY DEVELOPMENT EXPERIENCE

Eventually I want adding a new strategy to be simple.

Example conceptual structure:

strategies/
    ema-crossover/
        strategy.ts
        config.ts
        indicators.ts
        strategy.test.ts

Adding a strategy should NOT require modifying the execution engine.

Strategies should be plugins/modules.

---

# 66. STRATEGY CONFIGURATION VALIDATION

Each strategy should define its own configuration schema.

Example:

EMA crossover:

fastPeriod
slowPeriod

Validation:

fastPeriod > 0
slowPeriod > fastPeriod

Invalid configurations should be rejected before the strategy starts.

---

# 67. INDICATOR LIBRARY

Indicators should be reusable.

Possible examples:

EMA
SMA
RSI
MACD
ATR
Bollinger Bands

Avoid recalculating entire historical arrays on every real-time candle where incremental calculation is possible.

But prioritize correctness before micro-optimization.

---

# 68. IMPORTANT SAFETY PRINCIPLE

Do NOT treat historical profitability as proof that the strategy will remain profitable.

Whenever evaluating strategies, clearly distinguish between:

- historical simulation
- paper trading
- live execution

Account for:

- market-regime changes
- overfitting
- fees
- slippage
- liquidity
- funding
- latency
- liquidation risk

The software should enforce mechanical risk controls regardless of strategy confidence.

---

# 69. QUESTIONS YOU SHOULD ANSWER FIRST

Before we implement strategies, give me a comprehensive technical analysis answering:

1. Is this platform technically feasible?

2. What architecture do you recommend?

3. Should we use TypeScript only or TypeScript + Python?

4. What database should we use?

5. Should historical candles live in PostgreSQL, TimescaleDB, ClickHouse, Parquet, or something else?

6. Should we use Redis initially?

7. Should this start as a modular monolith or microservices?

8. Which futures exchange should be integrated first and why?

9. Should we use CCXT, an official SDK, or direct API integration?

10. What service should handle market data?

11. How should the backtesting engine work?

12. How should we prevent look-ahead bias?

13. How should simulated order execution work?

14. How should fees/slippage/funding be modeled?

15. How should the strategy abstraction work?

16. How should strategy versioning work?

17. How should the risk engine work?

18. How should position sizing work?

19. How should capital allocation work?

20. How should stop-loss and take-profit orders work?

21. How should we reconcile exchange state?

22. How should crash recovery work?

23. How should paper trading work?

24. How should we transition safely from paper to live?

25. Which monitoring tools should we use?

26. What external accounts/services do I need?

27. What should NOT be built during MVP?

28. What are the major technical risks?

29. What are the major trading-system operational risks?

30. What does a realistic development timeline look like?

31. What would approximate infrastructure cost be?

32. What should our repository structure look like?

33. What should our initial database schema look like?

34. What should our first implementation milestone contain?

---

# 70. OUTPUT FORMAT FOR YOUR FIRST RESPONSE

Do NOT start writing the whole application yet.

Your first response should be an engineering design proposal containing these sections:

## 1. Executive Summary

Summarize the proposed system.

## 2. Feasibility Analysis

Explain what is straightforward, difficult, and risky.

## 3. Recommended Technology Stack

Provide a table:

Component
Technology
Reason
Alternatives

## 4. TypeScript vs Python Decision

Analyze both and recommend our architecture.

## 5. High-Level Architecture

Provide an ASCII architecture diagram.

Example conceptually:

Exchange
   ↓
Market Data Adapter
   ↓
Market Data Engine
   ↓
Strategy Engine
   ↓
Signal Engine
   ↓
Risk Engine
   ↓
Position Sizing
   ↓
Execution Engine
   ↓
Exchange Adapter

With persistence and analytics connected appropriately.

Design the proper version.

## 6. Trading Lifecycle

Walk through:

Market Data → Signal → Risk → Order → Position → Exit → Analytics

## 7. Backtesting Architecture

Explain the engine in detail.

## 8. Paper Trading Architecture

Explain how it reuses production components.

## 9. Live Trading Architecture

Explain how live execution differs from paper trading.

## 10. Risk Architecture

Explain:

- capital allocation
- position sizing
- R:R
- leverage
- daily limits
- circuit breakers
- low balance
- kill switch

## 11. Exchange Integration

Recommend initial exchange and integration method.

Verify current API capabilities through official documentation before making claims that could have changed.

## 12. Database Architecture

Recommend storage technology and explain the schema conceptually.

## 13. Proposed Database Schema

Show initial tables/entities and important relationships.

## 14. Repository Structure

Show proposed directory tree.

## 15. Data Flow

Show how:

historical data

live data

signals

orders

trades

analytics

move through the system.

## 16. Failure Scenarios

Explain behavior during:

- exchange downtime
- WebSocket disconnect
- database outage
- bot restart
- rejected order
- partial fill
- TP failure
- SL failure
- low balance
- duplicate events

## 17. Development Roadmap

Create phases with deliverables.

For each phase give:

Goal
Features
Acceptance Criteria
Estimated Effort
Dependencies

## 18. MVP Definition

Clearly define what belongs in MVP.

## 19. What We Should NOT Build Yet

Prevent over-engineering.

## 20. Services / Accounts Required

Separate:

Now

Paper Trading Stage

Live Trading Stage

Optional Later

## 21. Approximate Infrastructure Cost

Provide practical ranges.

## 22. Testing Strategy

Explain unit, integration, simulation, testnet and live-readiness testing.

## 23. Security Checklist

Especially exchange credentials and live trading permissions.

## 24. Operational Checklist

Monitoring, backups, alerts and deployment.

## 25. Open Architectural Decisions

Identify decisions that should be made before Phase 1 implementation.

## 26. Recommended Phase 1 Plan

Give the exact first milestone we should build together.

---

# 71. IMPORTANT INSTRUCTIONS FOR CODEX DURING DEVELOPMENT

When I tell you:

"Implement Phase X"

Do not blindly generate code.

First:

1. inspect the existing repository
2. read relevant documentation
3. understand current architecture
4. identify affected modules
5. propose a small implementation plan
6. implement the changes
7. add/update tests
8. run tests
9. run lint/typecheck
10. report what changed

When existing code conflicts with architecture assumptions, inspect the current implementation rather than overwriting it.

Do not remove working functionality unnecessarily.

---

# 72. WHEN USING THIRD-PARTY LIBRARIES

Before adding a dependency:

- explain why it is needed
- confirm it is actively maintained where relevant
- check current official documentation
- avoid unnecessary dependencies
- prefer mature libraries
- pin appropriate versions
- consider security implications

For exchange APIs, rely primarily on official current documentation.

Do not invent endpoints or API behavior from memory.

---

# 73. WHEN WRITING DATABASE MIGRATIONS

Never casually destroy production data.

Use forward migrations.

For destructive changes:

- explain migration risk
- provide migration path
- backup first
- avoid automatic data deletion

---

# 74. GIT PRACTICES

Recommend sensible commits.

Examples:

feat(backtest): add historical execution engine

feat(risk): add capital allocation limits

feat(exchange): add futures exchange adapter

test(risk): add position sizing edge cases

docs(architecture): document execution flow

Do not combine massive unrelated changes into one implementation step.

---

# 75. DEFINITION OF SUCCESS FOR V1

V1 should allow me to:

1. download historical futures candle data

2. configure a ticker

3. configure a strategy

4. configure capital allocation

5. configure risk/reward

6. run the strategy against historical data

7. simulate realistic entries/exits

8. calculate fees/slippage

9. view performance statistics

10. persist results

11. run the same strategy against live data using paper trading

12. store paper trades

13. compare backtest and paper performance

14. enable/disable strategies per ticker

15. enforce portfolio/risk limits

16. receive important notifications

17. connect to an exchange test environment

18. reconcile orders/positions

19. recover safely after restart

20. eventually enable real execution only after explicit configuration

---

# 76. FINAL PRIORITY ORDER

Prioritize:

CORRECTNESS

then

CAPITAL SAFETY

then

TESTABILITY

then

OBSERVABILITY

then

MAINTAINABILITY

then

PERFORMANCE

Do NOT sacrifice financial correctness for premature performance optimization.

Do NOT sacrifice risk controls for faster implementation.

---

# START

Begin by analyzing this specification.

Do not implement trading strategies yet.

Do not start with frontend development.

Do not place any live orders.

First produce the complete engineering architecture proposal described in Section 70.

After presenting the architecture, recommend the exact first development milestone and proposed repository structure.

Then stop so we can review the architecture before implementation begins.
