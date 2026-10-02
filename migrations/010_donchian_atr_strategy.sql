INSERT INTO strategy_versions (
  strategy_id,
  version,
  display_name,
  configuration
) VALUES (
  'DONCHIAN_ATR',
  '1.0.0',
  'Donchian Breakout with ATR Trailing Stop',
  '{"channelPeriod":20,"atrPeriod":14,"atrMultiplier":"2.5","rewardRisk":"10","entry":"CLOSE_OUTSIDE_PREVIOUS_CHANNEL","exit":"NEXT_CANDLE_ATR_TRAIL"}'::jsonb
)
ON CONFLICT (strategy_id, version) DO NOTHING;
