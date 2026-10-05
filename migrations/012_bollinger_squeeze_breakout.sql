INSERT INTO strategy_versions (
  strategy_id,
  version,
  display_name,
  configuration
) VALUES (
  'BB_SQUEEZE_BREAKOUT',
  '1.0.0',
  'Bollinger Squeeze Breakout',
  '{"bollingerPeriod":20,"bollingerDeviation":"2","squeezeLookback":100,"squeezePercentile":20,"atrPeriod":14,"atrExpansion":"1.2","stopAtrMultiplier":"1.5","trailAtrMultiplier":"2","rewardRisk":"10","entry":"COMPRESSED_RANGE_BREAKOUT","exit":"ATR_TRAIL"}'::jsonb
)
ON CONFLICT (strategy_id, version) DO NOTHING;
