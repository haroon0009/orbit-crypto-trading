CREATE TABLE strategy_versions (
  strategy_id text NOT NULL,
  version text NOT NULL,
  display_name text NOT NULL,
  configuration jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (strategy_id, version)
);

INSERT INTO strategy_versions (strategy_id, version, display_name, configuration)
VALUES (
  'EMA_CROSS',
  '1.0.0',
  'EMA 20 / EMA 50 Trend',
  '{"fastPeriod":20,"slowPeriod":50,"entry":"NEXT_CANDLE"}'::jsonb
);

CREATE TABLE bot_assignments (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 80),
  exchange text NOT NULL CHECK (exchange IN ('BYBIT')),
  symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9]{3,20}$'),
  interval_minutes smallint NOT NULL CHECK (interval_minutes IN (1, 3, 5, 15, 30, 60, 240, 1440)),
  strategy_id text NOT NULL,
  strategy_version text NOT NULL,
  total_capital numeric(38, 18) NOT NULL CHECK (total_capital > 0),
  min_trade_amount numeric(38, 18) NOT NULL CHECK (min_trade_amount > 0),
  max_trade_amount numeric(38, 18) NOT NULL CHECK (max_trade_amount >= min_trade_amount AND max_trade_amount <= total_capital),
  leverage numeric(38, 18) NOT NULL CHECK (leverage >= 1),
  stop_loss_percent numeric(38, 18) NOT NULL CHECK (stop_loss_percent > 0),
  take_profit_percent numeric(38, 18) NOT NULL CHECK (take_profit_percent > 0),
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (strategy_id, strategy_version)
    REFERENCES strategy_versions(strategy_id, version),
  UNIQUE (exchange, symbol, interval_minutes)
);
