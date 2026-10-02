import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router";

import { BacktestCharts } from "@/components/backtest-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface BacktestDetailData {
  run: {
    id: string;
    strategy_id: string;
    strategy_version: string;
    symbol: string;
    interval_minutes: number;
    start_time: string;
    end_time: string;
    candle_count: number;
    dataset_hash: string;
    configuration: Record<string, unknown>;
    metrics: Record<string, string | number>;
    created_at: string;
  };
  trades: Array<{
    id: number;
    direction: string;
    entry_time: string;
    exit_time: string;
    quantity: number;
    entry_price: number;
    exit_price: number;
    stop_loss: number;
    take_profit: number;
    gross_pnl: number;
    fees: number;
    net_pnl: number;
    exit_reason: string;
  }>;
  equity: Array<{
    timestamp: string;
    balance: number;
    equity: number;
    drawdown: number;
    drawdown_percent: number;
  }>;
  riskDecisions: Array<{
    occurred_at: string;
    accepted: boolean;
    reason_code: string;
  }>;
}

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export function BacktestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<BacktestDetailData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/backtests/${encodeURIComponent(id ?? "")}`)
      .then(async (response) => {
        const body = (await response.json()) as BacktestDetailData & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Backtest not found");
        setData(body);
      })
      .catch((caught: Error) => setError(caught.message));
  }, [id]);

  if (error)
    return (
      <div className="rounded-xl border p-6">
        <p className="text-destructive">{error}</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => navigate("/backtests")}
        >
          <ArrowLeft data-icon="inline-start" /> Back to backtests
        </Button>
      </div>
    );
  if (!data)
    return (
      <div className="grid min-h-80 place-items-center">
        <RefreshCw className="size-6 animate-spin" />
      </div>
    );

  const { run, trades, equity, riskDecisions } = data;
  const metrics = run.metrics;
  const metric = (key: string) => Number(metrics[key] ?? 0);
  const winners = trades.filter((trade) => trade.net_pnl > 0).length;
  const losers = trades.filter((trade) => trade.net_pnl < 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-primary text-[10px] font-bold tracking-[.16em]">
            BACKTEST DETAIL
          </p>
          <h2 className="text-2xl font-semibold">
            {run.strategy_id} {run.strategy_version}
          </h2>
          <p className="text-sm text-muted-foreground">
            {run.symbol} · {run.interval_minutes}m ·{" "}
            {new Date(run.start_time).toLocaleDateString()} —{" "}
            {new Date(run.end_time).toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/backtests")}>
          <ArrowLeft data-icon="inline-start" />
          Back to backtests
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Net profit"
          value={`${metric("netProfit") >= 0 ? "+" : ""}$${number.format(metric("netProfit"))}`}
        />
        <Metric
          label="Return"
          value={`${number.format(metric("returnPercent"))}%`}
        />
        <Metric
          label="Win rate"
          value={`${number.format(metric("winRatePercent"))}%`}
        />
        <Metric
          label="Max drawdown"
          value={`${number.format(metric("maxDrawdownPercent"))}%`}
        />
        <Metric label="Trades" value={String(trades.length)} />
        <Metric label="Winners / losers" value={`${winners} / ${losers}`} />
        <Metric
          label="Profit factor"
          value={number.format(metric("profitFactor"))}
        />
        <Metric
          label="Expectancy"
          value={`$${number.format(metric("expectancy"))}`}
        />
      </div>

      <BacktestCharts equity={equity} trades={trades} />

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold">Run configuration</h3>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            {JSON.stringify(run.configuration, null, 2)}
          </pre>
        </section>
        <section className="rounded-xl border bg-card p-5 text-sm">
          <h3 className="font-semibold">Dataset</h3>
          <dl className="mt-3 grid gap-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Candles</dt>
              <dd>{run.candle_count.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Created</dt>
              <dd>{new Date(run.created_at).toLocaleString()}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-muted-foreground">Dataset hash</dt>
              <dd className="break-all font-mono text-xs">
                {run.dataset_hash}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-5">
          <h3 className="font-semibold">Trade log</h3>
          <p className="text-xs text-muted-foreground">
            Every simulated trade in chronological order.
          </p>
        </div>
        <Table
          headers={[
            "Entry",
            "Exit",
            "Side",
            "Quantity",
            "Entry price",
            "Exit price",
            "Stop",
            "Target",
            "Fees",
            "Net P&L",
            "Reason",
          ]}
          rows={trades.map((trade) => [
            new Date(trade.entry_time).toLocaleString(),
            new Date(trade.exit_time).toLocaleString(),
            trade.direction,
            number.format(trade.quantity),
            number.format(trade.entry_price),
            number.format(trade.exit_price),
            number.format(trade.stop_loss),
            number.format(trade.take_profit),
            `$${number.format(trade.fees)}`,
            `${trade.net_pnl >= 0 ? "+" : ""}$${number.format(trade.net_pnl)}`,
            trade.exit_reason,
          ])}
        />
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-5">
          <h3 className="font-semibold">Risk decision log</h3>
        </div>
        <Table
          headers={["Time", "Decision", "Reason"]}
          rows={riskDecisions.map((decision) => [
            new Date(decision.occurred_at).toLocaleString(),
            <Badge
              key="decision"
              variant={decision.accepted ? "default" : "destructive"}
            >
              {decision.accepted ? "Accepted" : "Rejected"}
            </Badge>,
            decision.reason_code,
          ])}
        />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="mt-2 block font-mono text-xl">{value}</strong>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  if (!rows.length)
    return <p className="p-6 text-sm text-muted-foreground">No records.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="border-b px-4 py-3 text-muted-foreground whitespace-nowrap"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b last:border-0">
              {row.map((value, column) => (
                <td
                  key={`${index}-${headers[column]}`}
                  className="px-4 py-3 whitespace-nowrap"
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
