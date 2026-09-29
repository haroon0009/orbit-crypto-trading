CREATE TABLE capital_allocations (
  id uuid PRIMARY KEY,
  account_key text NOT NULL UNIQUE,
  total_capital numeric(38, 18) NOT NULL CHECK (total_capital > 0),
  reserved_capital numeric(38, 18) NOT NULL DEFAULT 0 CHECK (reserved_capital >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved_capital <= total_capital)
);

CREATE TABLE risk_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid REFERENCES backtest_runs(id) ON DELETE CASCADE,
  allocation_id uuid REFERENCES capital_allocations(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  accepted boolean NOT NULL,
  reason_code text NOT NULL,
  inputs jsonb NOT NULL,
  output jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (run_id IS NOT NULL OR allocation_id IS NOT NULL)
);

