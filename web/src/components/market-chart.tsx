import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { Candle } from "@/dashboard";

export function MarketChart({ candles }: { candles: Candle[] }) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick">>(null);
  const volumeSeries = useRef<ISeriesApi<"Histogram">>(null);

  useEffect(() => {
    if (!container.current) return;
    chart.current = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0d1218" },
        textColor: "#71808e",
        fontFamily: "Inter, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "#151d25" },
        horzLines: { color: "#151d25" },
      },
      rightPriceScale: { borderColor: "#26313c" },
      timeScale: {
        borderColor: "#26313c",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    candleSeries.current = chart.current.addSeries(CandlestickSeries, {
      upColor: "#21d69b",
      downColor: "#f26472",
      borderVisible: false,
      wickUpColor: "#21d69b",
      wickDownColor: "#f26472",
    });
    volumeSeries.current = chart.current.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.current
      .priceScale("volume")
      .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    return () => chart.current?.remove();
  }, []);

  useEffect(() => {
    candleSeries.current?.setData(
      candles.map(({ time, open, high, low, close }) => ({
        time: time as Time,
        open,
        high,
        low,
        close,
      })),
    );
    volumeSeries.current?.setData(
      candles.map((candle) => ({
        time: candle.time as Time,
        value: candle.volume,
        color:
          candle.close >= candle.open
            ? "rgba(33,214,155,.24)"
            : "rgba(242,100,114,.24)",
      })),
    );
    chart.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <div className="relative">
      <div ref={container} className="h-[430px] w-full" />
      {!candles.length && (
        <div className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
          No candles found for this market and interval.
        </div>
      )}
    </div>
  );
}
