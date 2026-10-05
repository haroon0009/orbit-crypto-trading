import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Pencil, Power, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/form-select";
import {
  historicalMarketOptions,
  type HistoricalDatasetOption,
} from "@/market-options";

type Strategy = {
  strategy_id: string;
  version: string;
  display_name: string;
  active: boolean;
};
type Bot = {
  id: string;
  name: string;
  exchange: string;
  symbol: string;
  interval_minutes: number;
  strategy_id: string;
  strategy_version: string;
  total_capital: number;
  min_trade_amount: number;
  max_trade_amount: number;
  leverage: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  active: boolean;
};
const emptyBot = {
  name: "",
  exchange: "BYBIT",
  symbol: "BTCUSDT",
  interval_minutes: 15,
  strategy_id: "",
  strategy_version: "1",
  total_capital: 1000,
  min_trade_amount: 100,
  max_trade_amount: 200,
  leverage: 2,
  stop_loss_percent: 1,
  take_profit_percent: 2,
};

export function BotManagement() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [datasets, setDatasets] = useState<HistoricalDatasetOption[]>([]);
  const [editing, setEditing] = useState<Bot | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard");
    if (!response.ok) throw new Error("Could not load bots");
    const data = (await response.json()) as {
      bots: Bot[];
      strategyVersions: Strategy[];
      historicalDatasets: HistoricalDatasetOption[];
    };
    setBots(data.bots);
    setStrategies(data.strategyVersions);
    setDatasets(data.historicalDatasets);
  }, []);
  useEffect(() => {
    refresh().catch((error: Error) => setMessage(error.message));
  }, [refresh]);

  async function send(path: string, init: RequestInit, success: string) {
    const response = await fetch(path, init);
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "Bot update failed");
    setMessage(success);
    setEditing(null);
    await refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const [strategyId, strategyVersion] = String(values.strategy).split(":");
    const payload = {
      name: values.name,
      exchange: values.exchange,
      symbol: String(values.symbol).toUpperCase(),
      interval: values.interval,
      strategyId,
      strategyVersion,
      totalCapital: values.totalCapital,
      minTradeAmount: values.minTradeAmount,
      maxTradeAmount: values.maxTradeAmount,
      leverage: values.leverage,
      stopLossPercent: values.stopLossPercent,
      takeProfitPercent: values.takeProfitPercent,
    };
    send(
      editing ? `/api/bots/${editing.id}` : "/api/bots",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      editing ? "Bot updated" : "Bot created",
    ).catch((error: Error) => setMessage(error.message));
  }

  const defaults = editing ?? emptyBot;
  const markets = historicalMarketOptions(datasets);
  const market =
    markets.find(
      (item) => item.symbol === (selectedSymbol || defaults.symbol),
    ) ?? markets[0];
  const available = strategies.filter(
    (strategy) =>
      strategy.active ||
      (editing?.strategy_id === strategy.strategy_id &&
        editing.strategy_version === strategy.version),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bots</h1>
        <p className="text-sm text-muted-foreground">
          Create and control strategy assignments.
        </p>
      </div>
      <form
        key={editing?.id ?? "new"}
        onSubmit={submit}
        className="grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <h2 className="font-semibold sm:col-span-2 lg:col-span-4">
          {editing ? `Edit ${editing.name}` : "Create bot"}
        </h2>
        <Field name="name" label="Name" value={defaults.name} />
        <label className="grid gap-1 text-sm">
          Exchange
          <FormSelect
            name="exchange"
            defaultValue={defaults.exchange}
            options={[{ value: "BYBIT", label: "Bybit" }]}
            ariaLabel="Exchange"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Ticker
          <FormSelect
            name="symbol"
            value={market?.symbol ?? ""}
            onValueChange={setSelectedSymbol}
            disabled={!market}
            options={markets.map((item) => ({
              value: item.symbol,
              label: item.symbol,
            }))}
            ariaLabel="Ticker"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Time frame
          <FormSelect
            key={market?.symbol}
            name="interval"
            defaultValue={
              market?.intervals.includes(defaults.interval_minutes)
                ? String(defaults.interval_minutes)
                : String(market?.intervals[0] ?? "")
            }
            disabled={!market}
            options={(market?.intervals ?? []).map((interval) => ({
              value: String(interval),
              label: `${interval} minutes`,
            }))}
            ariaLabel="Time frame"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Strategy
          <FormSelect
            name="strategy"
            required
            defaultValue={`${defaults.strategy_id}:${defaults.strategy_version}`}
            placeholder="Select strategy"
            options={available.map((strategy) => ({
              value: `${strategy.strategy_id}:${strategy.version}`,
              label: `${strategy.display_name} v${strategy.version}`,
            }))}
            ariaLabel="Strategy"
          />
        </label>
        <Field
          name="totalCapital"
          label="Capital"
          value={defaults.total_capital}
          type="number"
        />
        <Field
          name="minTradeAmount"
          label="Min trade"
          value={defaults.min_trade_amount}
          type="number"
        />
        <Field
          name="maxTradeAmount"
          label="Max trade"
          value={defaults.max_trade_amount}
          type="number"
        />
        <Field
          name="leverage"
          label="Leverage"
          value={defaults.leverage}
          type="number"
        />
        <Field
          name="stopLossPercent"
          label="Stop loss %"
          value={defaults.stop_loss_percent}
          type="number"
        />
        <Field
          name="takeProfitPercent"
          label="Take profit %"
          value={defaults.take_profit_percent}
          type="number"
        />
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={!market || !available.length}>
            {editing ? "Save" : "Create"}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setSelectedSymbol("");
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {message}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {bots.map((bot) => (
          <section
            key={bot.id}
            className="rounded-xl border bg-card p-5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">{bot.name}</h2>
              <Badge variant={bot.active ? "default" : "outline"}>
                {bot.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {bot.exchange} · {bot.symbol} · {bot.interval_minutes}m
            </p>
            <p className="mt-3 text-sm">
              {bot.strategy_id} v{bot.strategy_version} · ${bot.total_capital} ·{" "}
              {bot.leverage}x
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  send(
                    `/api/bots/${bot.id}/status`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ active: !bot.active }),
                    },
                    "Bot status updated",
                  ).catch((error: Error) => setMessage(error.message))
                }
              >
                <Power data-icon="inline-start" />
                {bot.active ? "Deactivate" : "Activate"}
              </Button>
              <Button
                variant="outline"
                disabled={bot.active}
                onClick={() => {
                  setEditing(bot);
                  setSelectedSymbol(bot.symbol);
                }}
              >
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                disabled={bot.active}
                onClick={() => {
                  if (window.confirm(`Delete ${bot.name}?`))
                    send(
                      `/api/bots/${bot.id}`,
                      { method: "DELETE" },
                      "Bot deleted",
                    ).catch((error: Error) => setMessage(error.message));
                }}
              >
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  value,
  type = "text",
}: {
  name: string;
  label: string;
  value: string | number;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <input
        name={name}
        type={type}
        required
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        defaultValue={value}
        className="h-10 rounded-md border bg-background px-3"
      />
    </label>
  );
}
