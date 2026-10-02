CREATE TABLE paper_accounts (
  id uuid PRIMARY KEY,
  account_key text NOT NULL UNIQUE,
  strategy_id text NOT NULL,
  strategy_version text NOT NULL,
  symbol text NOT NULL,
  interval_minutes smallint NOT NULL CHECK (interval_minutes > 0),
  configuration jsonb NOT NULL,
  starting_balance numeric(38, 18) NOT NULL CHECK (starting_balance > 0),
  balance numeric(38, 18) NOT NULL CHECK (balance >= 0),
  equity numeric(38, 18) NOT NULL CHECK (equity >= 0),
  daily_realized_pnl numeric(38, 18) NOT NULL DEFAULT 0,
  daily_pnl_date date,
  dry_run boolean NOT NULL,
  last_candle_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE paper_orders (
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
  id text NOT NULL,
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  order_type text NOT NULL CHECK (order_type IN ('MARKET', 'STOP_MARKET', 'TAKE_PROFIT')),
  status text NOT NULL CHECK (status IN ('PENDING', 'PLANNED', 'REJECTED', 'FILLED')),
  requested_price numeric(38, 18),
  quantity numeric(38, 18) CHECK (quantity > 0),
  signal jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, id)
);

CREATE TABLE paper_fills (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL,
  order_id text NOT NULL,
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  price numeric(38, 18) NOT NULL CHECK (price > 0),
  quantity numeric(38, 18) NOT NULL CHECK (quantity > 0),
  fee numeric(38, 18) NOT NULL CHECK (fee >= 0),
  filled_at timestamptz NOT NULL,
  UNIQUE (account_id, order_id),
  FOREIGN KEY (account_id, order_id) REFERENCES paper_orders(account_id, id) ON DELETE CASCADE
);

CREATE TABLE paper_positions (
  account_id uuid NOT NULL,
  entry_order_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  quantity numeric(38, 18) NOT NULL CHECK (quantity > 0),
  stop_loss numeric(38, 18) NOT NULL CHECK (stop_loss > 0),
  take_profit numeric(38, 18) NOT NULL CHECK (take_profit > 0),
  reserved_capital numeric(38, 18) NOT NULL CHECK (reserved_capital > 0),
  status text NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  opened_at timestamptz NOT NULL,
  closed_at timestamptz,
  PRIMARY KEY (account_id, entry_order_id),
  FOREIGN KEY (account_id, entry_order_id) REFERENCES paper_orders(account_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX paper_one_open_position
  ON paper_positions (account_id) WHERE status = 'OPEN';

CREATE TABLE paper_trades (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
  entry_order_id text NOT NULL,
  exit_order_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  quantity numeric(38, 18) NOT NULL CHECK (quantity > 0),
  entry_price numeric(38, 18) NOT NULL CHECK (entry_price > 0),
  exit_price numeric(38, 18) NOT NULL CHECK (exit_price > 0),
  stop_loss numeric(38, 18) NOT NULL CHECK (stop_loss > 0),
  take_profit numeric(38, 18) NOT NULL CHECK (take_profit > 0),
  gross_pnl numeric(38, 18) NOT NULL,
  fees numeric(38, 18) NOT NULL CHECK (fees >= 0),
  net_pnl numeric(38, 18) NOT NULL,
  exit_reason text NOT NULL CHECK (exit_reason IN ('STOP_LOSS', 'TAKE_PROFIT', 'END_OF_DATA')),
  opened_at timestamptz NOT NULL,
  closed_at timestamptz NOT NULL,
  UNIQUE (account_id, entry_order_id),
  FOREIGN KEY (account_id, entry_order_id) REFERENCES paper_positions(account_id, entry_order_id),
  FOREIGN KEY (account_id, exit_order_id) REFERENCES paper_orders(account_id, id)
);
