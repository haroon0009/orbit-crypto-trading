INSERT INTO strategy_versions (
  strategy_id,
  version,
  display_name,
  configuration
) VALUES (
  'HTF_TREND_PULLBACK',
  '1.0.0',
  'Higher-Timeframe Trend Pullback',
  '{"higherTimeframeMinutes":240,"higherFastPeriod":20,"higherSlowPeriod":50,"entryEmaPeriod":20,"atrPeriod":14,"confirmationBars":3,"atrMultiplier":"1.5","structureBufferAtr":"0.25","rewardRisk":"2","entry":"PULLBACK_THEN_CONFIRM","exit":"FIXED_2R"}'::jsonb
)
ON CONFLICT (strategy_id, version) DO NOTHING;
