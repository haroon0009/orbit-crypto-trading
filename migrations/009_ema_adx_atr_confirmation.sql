UPDATE strategy_versions
SET configuration = configuration || '{
  "confirmationBars": 3,
  "setup": "PULLBACK_CLOSE_AT_FAST_EMA",
  "confirmation": "BREAK_SETUP_CANDLE_EXTREME",
  "trend": "EMA_ALIGNMENT_WITH_SLOW_EMA_SLOPE"
}'::jsonb
WHERE strategy_id = 'EMA_ADX_ATR' AND version = '1.0.0';
