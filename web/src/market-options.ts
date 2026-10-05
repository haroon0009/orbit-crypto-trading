export interface HistoricalDatasetOption {
  symbol: string;
  interval_minutes: number;
  start_time?: string;
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

export function historicalStartDate(
  datasets: HistoricalDatasetOption[],
  symbol: string,
  interval: number,
) {
  const value = datasets.find(
    (dataset) =>
      dataset.symbol === symbol && dataset.interval_minutes === interval,
  )?.start_time;
  if (!value) return "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString().slice(0, 10)
    : "";
}
