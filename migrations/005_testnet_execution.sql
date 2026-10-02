CREATE TABLE execution_accounts (
  id uuid PRIMARY KEY,
  account_key text NOT NULL UNIQUE,
  symbol text NOT NULL,
  ready boolean NOT NULL DEFAULT false,
  reconciled_snapshot jsonb,
  last_reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE execution_intents (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES execution_accounts(id) ON DELETE CASCADE,
  intent_key text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  quantity numeric(38, 18) NOT NULL CHECK (quantity > 0),
  stop_loss numeric(38, 18) NOT NULL CHECK (stop_loss > 0),
  take_profit numeric(38, 18) NOT NULL CHECK (take_profit > 0),
  state text NOT NULL CHECK (state IN (
    'PLANNED', 'ENTRY_SUBMITTED', 'ENTRY_PARTIALLY_FILLED', 'ENTRY_FILLED',
    'PROTECTED', 'CLOSING', 'CLOSED', 'CANCELLED', 'REJECTED', 'UNKNOWN', 'FAILED'
  )),
  client_entry_order_id text,
  exchange_entry_order_id text,
  protected_quantity numeric(38, 18) NOT NULL DEFAULT 0 CHECK (protected_quantity >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, intent_key)
);

CREATE UNIQUE INDEX execution_one_active_intent
  ON execution_intents (account_id)
  WHERE state NOT IN ('CLOSED', 'CANCELLED', 'REJECTED', 'FAILED');
