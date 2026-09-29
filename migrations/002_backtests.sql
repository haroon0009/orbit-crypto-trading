CREATE TABLE backtest_runs (
  id uuid PRIMARY KEY,
  strategy_id text NOT NULL,
  strategy_version text NOT NULL,
  symbol text NOT NULL,
  interval_minutes smallint NOT NULL CHECK (interval_minutes > 0),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  candle_count integer NOT NULL CHECK (candle_count > 0),
  dataset_hash text NOT NULL,
  configuration jsonb NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE backtest_trades (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  entry_time timestamptz NOT NULL,
  exit_time timestamptz NOT NULL,
  quantity numeric(38, 18) NOT NULL CHECK (quantity > 0),
  entry_price numeric(38, 18) NOT NULL CHECK (entry_price > 0),
  exit_price numeric(38, 18) NOT NULL CHECK (exit_price > 0),
  stop_loss numeric(38, 18) NOT NULL CHECK (stop_loss > 0),
  take_profit numeric(38, 18) NOT NULL CHECK (take_profit > 0),
  gross_pnl numeric(38, 18) NOT NULL,
  fees numeric(38, 18) NOT NULL CHECK (fees >= 0),
  net_pnl numeric(38, 18) NOT NULL,
  exit_reason text NOT NULL CHECK (exit_reason IN ('STOP_LOSS', 'TAKE_PROFIT', 'END_OF_DATA'))
);

CREATE TABLE backtest_equity (
  run_id uuid NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  balance numeric(38, 18) NOT NULL,
  equity numeric(38, 18) NOT NULL,
  drawdown numeric(38, 18) NOT NULL CHECK (drawdown >= 0),
  drawdown_percent numeric(38, 18) NOT NULL CHECK (drawdown_percent >= 0),
  PRIMARY KEY (run_id, timestamp)
);

