import {
  AreaSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

interface EquityPoint {
  timestamp: string;
  equity: number;
  drawdown_percent: number;
}

interface TradePoint {
  exit_time: string;
  net_pnl: number;
}

const chartOptions = {
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
  timeScale: { borderColor: "#26313c", timeVisible: true },
} as const;

export function BacktestCharts({
  equity,
  trades,
}: {
  equity: EquityPoint[];
  trades: TradePoint[];
}) {
  const equityContainer = useRef<HTMLDivElement>(null);
  const pnlContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!equityContainer.current || !pnlContainer.current) return;
    const equityChart = createChart(equityContainer.current, chartOptions);
    const equitySeries = equityChart.addSeries(LineSeries, {
      color: "#21d69b",
      lineWidth: 2,
      title: "Equity",
    });
    const drawdownSeries = equityChart.addSeries(AreaSeries, {
      lineColor: "#f26472",
      topColor: "rgba(242,100,114,.22)",
      bottomColor: "rgba(242,100,114,0)",
      priceScaleId: "drawdown",
      title: "Drawdown %",
    });
    equityChart.priceScale("drawdown").applyOptions({
      scaleMargins: { top: 0.72, bottom: 0 },
    });
    equitySeries.setData(
      equity.map((point) => ({
        time: Math.floor(new Date(point.timestamp).getTime() / 1000) as Time,
        value: point.equity,
      })),
    );
    drawdownSeries.setData(
      equity.map((point) => ({
        time: Math.floor(new Date(point.timestamp).getTime() / 1000) as Time,
        value: point.drawdown_percent,
      })),
    );
    equityChart.timeScale().fitContent();

    const pnlChart = createChart(pnlContainer.current, chartOptions);
    const pnlSeries = pnlChart.addSeries(HistogramSeries, {
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      title: "Trade P&L",
    });
    pnlSeries.setData(
      trades.map((trade) => ({
        time: Math.floor(new Date(trade.exit_time).getTime() / 1000) as Time,
        value: trade.net_pnl,
        color: trade.net_pnl >= 0 ? "#21d69b" : "#f26472",
      })),
    );
    pnlChart.timeScale().fitContent();
    return () => {
      equityChart.remove();
      pnlChart.remove();
    };
  }, [equity, trades]);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Equity and drawdown</h3>
        <div ref={equityContainer} className="h-72" />
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Trade P&amp;L</h3>
        <div ref={pnlContainer} className="h-72" />
      </div>
    </div>
  );
}
