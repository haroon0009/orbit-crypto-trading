CREATE TABLE instruments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exchange text NOT NULL,
  market_type text NOT NULL,
  symbol text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exchange, market_type, symbol)
);

CREATE TABLE candles (
  instrument_id bigint NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  interval_minutes smallint NOT NULL CHECK (interval_minutes > 0),
  open_time timestamptz NOT NULL,
  open numeric(38, 18) NOT NULL CHECK (open > 0),
  high numeric(38, 18) NOT NULL CHECK (high > 0),
  low numeric(38, 18) NOT NULL CHECK (low > 0),
  close numeric(38, 18) NOT NULL CHECK (close > 0),
  volume numeric(38, 18) NOT NULL CHECK (volume >= 0),
  turnover numeric(38, 18) NOT NULL CHECK (turnover >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instrument_id, interval_minutes, open_time),
  CHECK (high >= open AND high >= low AND high >= close),
  CHECK (low <= open AND low <= high AND low <= close)
);

