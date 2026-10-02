INSERT INTO strategy_versions (
  strategy_id,
  version,
  display_name,
  configuration
) VALUES (
  'EMA_ADX_ATR',
  '1.0.0',
  'EMA Trend Pullback with ADX and ATR',
  '{"fastPeriod":20,"slowPeriod":50,"indicatorPeriod":14,"minimumAdx":"25","atrMultiplier":"1.5","rewardRisk":"2"}'::jsonb
)
ON CONFLICT (strategy_id, version) DO NOTHING;
