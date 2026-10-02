export interface HistoricalDatasetOption {
  symbol: string;
  interval_minutes: number;
}

export function historicalMarketOptions(datasets: HistoricalDatasetOption[]) {
  const markets = new Map<string, Set<number>>();
  for (const dataset of datasets) {
    const intervals = markets.get(dataset.symbol) ?? new Set<number>();
    intervals.add(dataset.interval_minutes);
    markets.set(dataset.symbol, intervals);
  }
  return [...markets].map(([symbol, intervals]) => ({
    symbol,
    intervals: [...intervals].sort((left, right) => left - right),
  }));
}
