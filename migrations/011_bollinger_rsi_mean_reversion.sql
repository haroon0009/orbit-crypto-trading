INSERT INTO strategy_versions (
  strategy_id,
  version,
  display_name,
  configuration
) VALUES (
  'BB_RSI_MEAN_REVERSION',
  '1.0.0',
  'Bollinger / RSI Mean Reversion',
  '{"bollingerPeriod":20,"bollingerDeviation":"2","rsiPeriod":14,"rsiOversold":"30","rsiOverbought":"70","adxPeriod":14,"maxAdx":"20","atrMultiplier":"1","entry":"BAND_REJECTION","exit":"MIDDLE_BAND"}'::jsonb
)
ON CONFLICT (strategy_id, version) DO NOTHING;
