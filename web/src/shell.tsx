import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  ChartNoAxesCombined,
  FlaskConical,
  LayoutDashboard,
  PlugZap,
  Power,
  RefreshCw,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router";

import { MarketChart } from "@/components/market-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useDashboard } from "@/dashboard";
import { BotManagement } from "@/bot-page";
import { BacktestDetail } from "@/backtest-detail";
import { Strategies } from "@/strategy-page";
import { historicalMarketOptions } from "@/market-options";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const price = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

interface JobTicket {
  queue: string;
  jobId: string;
}

interface JobStatus {
  state: string;
  result?: Record<string, unknown>;
  error?: string | null;
}

async function enqueueJob(url: string, input: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as JobTicket & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Job could not be queued");
  return body;
}

async function waitForJob(ticket: JobTicket): Promise<JobStatus> {
  for (let attempt = 0; attempt < 600; attempt++) {
    const response = await fetch(
      `/api/jobs/${encodeURIComponent(ticket.queue)}/${encodeURIComponent(ticket.jobId)}`,
    );
    const status = (await response.json()) as JobStatus & { error?: string };
    if (!response.ok) throw new Error(status.error ?? "Job status failed");
    if (status.state === "completed") return status;
    if (status.state === "failed")
      throw new Error(status.error ?? "Background job failed");
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
  throw new Error("Job is still running; refresh this page later");
}

const navigation = [
  ["/", "Dashboard", LayoutDashboard],
  ["/strategies", "Strategies", BrainCircuit],
  ["/bots", "Bots", Bot],
  ["/backtests", "BackTest", FlaskConical],
  ["/exchanges", "Exchanges", PlugZap],
  ["/analytics", "Analytics", ChartNoAxesCombined],
] as const;

export default function Shell() {
  const dashboard = useDashboard();
  return (
    <div className="bg-background min-h-screen">
      <aside className="border-border bg-sidebar fixed inset-y-0 left-0 z-20 hidden w-60 border-r md:flex md:flex-col">
        <Brand />
        <Navigation />
        <div className="border-border mt-auto border-t p-5">
          <div className="flex items-center gap-3 text-xs">
            <span className="bg-primary shadow-primary/30 size-2 rounded-full shadow-[0_0_0_5px]" />
            <div>
              <strong className="block">Local console</strong>
              <span className="text-muted-foreground">127.0.0.1 only</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-screen md:ml-60">
        <header className="border-border bg-background/95 sticky top-0 z-10 flex min-h-20 flex-wrap items-center justify-between gap-4 border-b px-4 py-4 backdrop-blur md:px-8">
          <div className="md:hidden">
            <Brand compact />
          </div>
          <div className="hidden md:block">
            <p className="text-primary text-[10px] font-bold tracking-[.16em]">
              TRADING OPERATIONS
            </p>
            <h1 className="text-xl font-semibold">Bot console</h1>
          </div>
          <div className="flex items-end gap-2">
            <Control label="Market">
              <select
                value={dashboard.symbol}
                onChange={(event) => dashboard.setSymbol(event.target.value)}
              >
                <option>BTCUSDT</option>
                <option>ETHUSDT</option>
              </select>
            </Control>
            <Control label="Interval">
              <select
                value={dashboard.interval}
                onChange={(event) =>
                  dashboard.setInterval(Number(event.target.value))
                }
              >
                <option value="5">5m</option>
                <option value="15">15m</option>
                <option value="60">1h</option>
                <option value="240">4h</option>
              </select>
            </Control>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void dashboard.refresh()}
              disabled={dashboard.loading}
              aria-label="Refresh dashboard"
            >
              <RefreshCw
                className={`size-4 ${dashboard.loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </header>
        <div className="border-border bg-sidebar flex overflow-x-auto border-b px-2 md:hidden">
          <Navigation mobile />
        </div>
        <div className="mx-auto max-w-[1600px] p-4 md:p-8">
          {dashboard.error && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive mb-4 border p-3 text-sm">
              {dashboard.error}
            </div>
          )}
          {!dashboard.data && dashboard.loading ? (
            <Loading />
          ) : (
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="strategies" element={<Strategies />} />
              <Route path="bots" element={<BotManagement />} />
              <Route path="backtests" element={<Backtests />} />
              <Route path="backtests/new" element={<NewBacktest />} />
              <Route path="backtests/:id" element={<BacktestDetail />} />
              <Route path="exchanges" element={<Exchanges />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          )}
        </div>
      </main>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 text-sm font-black tracking-[.18em] ${compact ? "" : "h-20 px-6"}`}
    >
      <span className="bg-primary text-primary-foreground grid size-8 place-items-center [clip-path:polygon(50%_0,92%_24%,92%_76%,50%_100%,8%_76%,8%_24%)]">
        O
      </span>
      ORBIT
    </div>
  );
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={mobile ? "flex" : "grid gap-1 px-3"}>
      {navigation.map(([to, label, Icon]) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            `flex h-11 shrink-0 items-center gap-3 px-3 text-sm transition-colors ${mobile ? "border-b-2" : "border-l-2"} ${isActive ? "border-primary bg-primary/8 text-foreground" : "text-muted-foreground hover:bg-accent border-transparent hover:text-foreground"}`
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="hidden sm:block">
      <span className="text-muted-foreground mb-1 block text-[9px] tracking-wider uppercase">
        {label}
      </span>
      <span className="border-border bg-secondary block rounded-md border [&_select]:h-9 [&_select]:min-w-24 [&_select]:bg-transparent [&_select]:px-3 [&_select]:text-sm [&_select]:outline-none">
        {children}
      </span>
    </label>
  );
}

function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-primary mb-1 text-[10px] font-bold tracking-[.16em]">
          {eyebrow}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

function PanelTitle({
  eyebrow,
  children,
  action,
}: {
  eyebrow: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <CardHeader className="justify-between">
      <div>
        <p className="text-primary mb-1 text-[9px] font-bold tracking-[.15em]">
          {eyebrow}
        </p>
        <h3 className="text-sm font-semibold">{children}</h3>
      </div>
      {action}
    </CardHeader>
  );
}

function Dashboard() {
  const { data } = useDashboard();
  if (!data) return null;
  const paper = data.paper;
  const position = paper?.position;
  const unrealized =
    position && data.market.lastPrice !== null
      ? (position.direction === "LONG"
          ? data.market.lastPrice - position.entry_price
          : position.entry_price - data.market.lastPrice) * position.quantity
      : null;
  const winRate = paper?.summary.totalTrades
    ? (paper.summary.winningTrades / paper.summary.totalTrades) * 100
    : 0;

  return (
    <>
      <PageTitle
        eyebrow="DASHBOARD"
        title="Trading overview"
        description={`${data.symbol} · ${data.interval}m aggregated paper and market data.`}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Total trades"
          value={String(paper?.summary.totalTrades ?? 0)}
          note={`${paper?.summary.winningTrades ?? 0} winning trades`}
        />
        <Metric
          label="Paper equity"
          value={paper ? `$${money.format(paper.equity)}` : "—"}
          note={paper?.dryRun ? "Dry-run account" : "Paper account"}
        />
        <Metric
          label="Realized P&L"
          value={
            paper
              ? `${paper.summary.netPnl >= 0 ? "+" : ""}$${money.format(paper.summary.netPnl)}`
              : "—"
          }
          note={`${winRate.toFixed(1)}% win rate`}
          tone={
            paper && paper.summary.netPnl < 0
              ? "text-destructive"
              : "text-primary"
          }
        />
        <Metric
          label="Active trade P&L"
          value={
            unrealized === null
              ? "—"
              : `${unrealized >= 0 ? "+" : ""}$${money.format(unrealized)}`
          }
          note={
            position
              ? `${position.direction} · ${position.quantity} ${data.symbol}`
              : "No active trade"
          }
          tone={
            unrealized !== null && unrealized < 0
              ? "text-destructive"
              : "text-primary"
          }
        />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(330px,1fr)]">
        <MarketPanel />
        <ActiveTrade unrealized={unrealized} />
      </div>
      <Card>
        <PanelTitle eyebrow="ACTIVITY">Recent trades</PanelTitle>
        <CardContent className="p-0">
          <SimpleTable
            headers={[
              "Closed",
              "Timeframe",
              "Side",
              "Entry",
              "Exit",
              "Net P&L",
            ]}
            rows={(paper?.trades ?? []).map((trade) => [
              new Date(trade.closed_at).toLocaleString(),
              `${data.interval}m`,
              trade.direction,
              price.format(trade.entry_price),
              price.format(trade.exit_price),
              `${trade.net_pnl >= 0 ? "+" : ""}$${money.format(trade.net_pnl)}`,
            ])}
            empty="No completed paper trades yet."
          />
        </CardContent>
      </Card>
    </>
  );
}

function ActiveTrade({ unrealized }: { unrealized: number | null }) {
  const { data } = useDashboard();
  const position = data?.paper?.position;
  return (
    <Card>
      <PanelTitle
        eyebrow="ACTIVE TRADE"
        action={
          <Badge variant={position ? "default" : "outline"}>
            {position ? "Open" : "None"}
          </Badge>
        }
      >
        {data?.symbol} position
      </PanelTitle>
      <CardContent>
        {position ? (
          <div className="grid grid-cols-2 gap-px bg-border">
            {[
              ["Direction", position.direction],
              ["Timeframe", `${data?.interval}m`],
              ["Entry", price.format(position.entry_price)],
              [
                "Current",
                data?.market.lastPrice
                  ? price.format(data.market.lastPrice)
                  : "—",
              ],
              ["Stop loss", price.format(position.stop_loss)],
              ["Take profit", price.format(position.take_profit)],
              ["Quantity", position.quantity],
              [
                "Unrealized P&L",
                unrealized === null
                  ? "—"
                  : `${unrealized >= 0 ? "+" : ""}$${money.format(unrealized)}`,
              ],
            ].map(([label, value]) => (
              <div className="bg-card p-4" key={label}>
                <span className="text-muted-foreground block text-[9px] uppercase">
                  {label}
                </span>
                <strong className="mt-2 block font-mono text-sm">
                  {value}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No active paper trade for this market and timeframe.</Empty>
        )}
      </CardContent>
    </Card>
  );
}

export function Bots() {
  const { data, refresh } = useDashboard();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!data) return null;
  const dashboardData = data;

  async function createBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setMessage(null);
    const form = new FormData(formElement);
    const strategy = dashboardData.strategyVersions.find(
      (item) => `${item.strategy_id}:${item.version}` === form.get("strategy"),
    );
    try {
      if (!strategy) throw new Error("Select a strategy");
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(form),
          strategyId: strategy.strategy_id,
          strategyVersion: strategy.version,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Bot creation failed");
      formElement.reset();
      setMessage("Bot assignment created. Review it before activation.");
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Bot creation failed",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    setMessage(null);
    try {
      const response = await fetch(`/api/bots/${id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Status update failed");
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Status update failed",
      );
    }
  }

  const activeBots = data.bots.filter((bot) => bot.active).length;
  return (
    <>
      <PageTitle
        eyebrow="PHASE 7"
        title="Trading bots"
        description={`${activeBots} active of ${data.bots.length} configured bots. One bot is allowed per exchange, ticker, and timeframe.`}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
        <Card>
          <PanelTitle eyebrow="NEW BOT">Assign a strategy</PanelTitle>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={createBot}>
              <Field label="Bot name">
                <input
                  name="name"
                  placeholder="BTC trend bot"
                  required
                  maxLength={80}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Exchange">
                  <select name="exchange" defaultValue="BYBIT">
                    <option value="BYBIT">Bybit</option>
                  </select>
                </Field>
                <Field label="Ticker">
                  <input
                    name="symbol"
                    defaultValue="BTCUSDT"
                    required
                    pattern="[A-Za-z0-9]+"
                  />
                </Field>
                <Field label="Timeframe">
                  <select name="interval" defaultValue="15">
                    <option value="5">5 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="240">4 hours</option>
                  </select>
                </Field>
                <Field label="Strategy version">
                  <select name="strategy" required defaultValue="">
                    <option value="" disabled>
                      Select strategy
                    </option>
                    {data.strategyVersions
                      .filter((strategy) => strategy.active)
                      .map((strategy) => (
                        <option
                          key={`${strategy.strategy_id}:${strategy.version}`}
                          value={`${strategy.strategy_id}:${strategy.version}`}
                        >
                          {strategy.display_name} · {strategy.version}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Total capital (USDT)">
                  <input
                    name="totalCapital"
                    type="number"
                    min="1"
                    step="any"
                    defaultValue="1000"
                    required
                  />
                </Field>
                <Field label="Leverage">
                  <input
                    name="leverage"
                    type="number"
                    min="1"
                    step="any"
                    defaultValue="2"
                    required
                  />
                </Field>
                <Field label="Minimum per trade">
                  <input
                    name="minTradeAmount"
                    type="number"
                    min="1"
                    step="any"
                    defaultValue="100"
                    required
                  />
                </Field>
                <Field label="Maximum per trade">
                  <input
                    name="maxTradeAmount"
                    type="number"
                    min="1"
                    step="any"
                    defaultValue="200"
                    required
                  />
                </Field>
                <Field label="Stop loss (%)">
                  <input
                    name="stopLossPercent"
                    type="number"
                    min="0.01"
                    step="any"
                    defaultValue="1"
                    required
                  />
                </Field>
                <Field label="Take profit (%)">
                  <input
                    name="takeProfitPercent"
                    type="number"
                    min="0.01"
                    step="any"
                    defaultValue="2"
                    required
                  />
                </Field>
              </div>
              <Button
                type="submit"
                disabled={submitting || !data.strategyVersions.length}
              >
                <Bot data-icon="inline-start" />
                {submitting ? "Creating…" : "Create inactive bot"}
              </Button>
              {message ? (
                <p className="text-muted-foreground text-xs leading-5">
                  {message}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
        <div className="grid content-start gap-4 lg:grid-cols-2">
          {data.bots.length ? (
            data.bots.map((bot) => (
              <Card key={bot.id}>
                <PanelTitle
                  eyebrow={`${bot.exchange} · ${bot.symbol} · ${bot.interval_minutes}m`}
                  action={
                    <Badge variant={bot.active ? "default" : "outline"}>
                      {bot.active ? "Active" : "Inactive"}
                    </Badge>
                  }
                >
                  {bot.name}
                </PanelTitle>
                <CardContent className="flex flex-col gap-4">
                  <Detail
                    label="Strategy"
                    value={`${bot.strategy_id} · ${bot.strategy_version}`}
                  />
                  <Detail
                    label="Capital"
                    value={`$${money.format(bot.total_capital)} USDT`}
                  />
                  <Detail
                    label="Per trade"
                    value={`$${money.format(bot.min_trade_amount)} — $${money.format(bot.max_trade_amount)}`}
                  />
                  <Detail
                    label="Risk"
                    value={`${bot.leverage}× · SL ${bot.stop_loss_percent}% · TP ${bot.take_profit_percent}%`}
                  />
                  <Detail label="Trades" value={String(bot.total_trades)} />
                  <Detail
                    label="Net P&L"
                    value={`${bot.net_pnl >= 0 ? "+" : ""}$${money.format(bot.net_pnl)}`}
                  />
                  <Button
                    variant="outline"
                    onClick={() => void setActive(bot.id, !bot.active)}
                  >
                    <Power data-icon="inline-start" />
                    {bot.active ? "Deactivate bot" : "Activate bot"}
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="lg:col-span-2">
              <Empty>
                No bots configured yet. Create one to assign the EMA strategy to
                a market.
              </Empty>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Backtests() {
  const { data } = useDashboard();
  const navigate = useNavigate();
  if (!data) return null;
  return (
    <>
      <PageTitle
        eyebrow="BACKTEST"
        title="Backtest history"
        description="Previous deterministic runs and their key performance metrics."
        action={
          <Button onClick={() => navigate("/backtests/new")}>
            <FlaskConical className="size-4" />
            Backtest strategy
          </Button>
        }
      />
      <HistoricalData />
      <Card>
        <PanelTitle eyebrow="RUNS">Previous backtests</PanelTitle>
        <CardContent className="p-0">
          <SimpleTable
            headers={[
              "Created",
              "Strategy",
              "Market",
              "Period",
              "Trades",
              "Return",
              "Win rate",
              "Drawdown",
              "",
            ]}
            rows={data.backtests.map((run) => [
              new Date(run.created_at).toLocaleString(),
              `${run.strategy_id} ${run.strategy_version}`,
              `${run.symbol} · ${run.interval_minutes}m`,
              `${new Date(run.start_time).toLocaleDateString()} — ${new Date(run.end_time).toLocaleDateString()}`,
              run.metrics.totalTrades ?? 0,
              percent(run.metrics.returnPercent),
              percent(run.metrics.winRatePercent),
              percent(run.metrics.maxDrawdownPercent),
              <Button
                key="details"
                variant="outline"
                onClick={() => navigate(`/backtests/${run.id}`)}
              >
                Details
              </Button>,
            ])}
            empty="No backtest runs saved yet."
          />
        </CardContent>
      </Card>
    </>
  );
}

function HistoricalData() {
  const { data, refresh } = useDashboard();
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    const form = new FormData(event.currentTarget);
    try {
      const ticket = await enqueueJob(
        "/api/historical-data",
        Object.fromEntries(form),
      );
      setResult(`Import queued as ${ticket.jobId}.`);
      const status = await waitForJob(ticket);
      const body = status.result ?? {};
      setResult(
        `Stored ${Number(body.inserted ?? 0)} new candles (${Number(body.count ?? 0)} checked, ${Array.isArray(body.missingOpenTimes) ? body.missingOpenTimes.length : 0} gaps).`,
      );
      await refresh();
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function resync(symbol: string, interval: number) {
    const key = `${symbol}-${interval}`;
    setSyncing(key);
    setResult(null);
    try {
      const ticket = await enqueueJob("/api/historical-data", {
        symbol,
        interval: String(interval),
        sync: true,
      });
      setResult(`Sync queued as ${ticket.jobId}.`);
      const status = await waitForJob(ticket);
      const inserted = Number(status.result?.inserted ?? 0);
      setResult(
        inserted
          ? `Synced ${inserted} new candles.`
          : "Dataset is already current.",
      );
      await refresh();
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(360px,1fr)_minmax(0,2fr)]">
      <Card>
        <PanelTitle eyebrow="BACKTEST DATA">Add historical candles</PanelTitle>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ticker">
                <input
                  name="symbol"
                  defaultValue="BTCUSDT"
                  required
                  pattern="[A-Za-z0-9]+"
                />
              </Field>
              <Field label="Timeframe">
                <select name="interval" defaultValue="15">
                  <option value="1">1 minute</option>
                  <option value="3">3 minutes</option>
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="240">4 hours</option>
                  <option value="720">12 hours</option>
                </select>
              </Field>
              <Field label="Start date">
                <input name="start" type="date" required />
              </Field>
              <Field label="End date (exclusive)">
                <input name="end" type="date" required />
              </Field>
            </div>
            <Button type="submit" disabled={submitting}>
              <FlaskConical data-icon="inline-start" />
              {submitting ? "Processing job…" : "Queue historical import"}
            </Button>
            {result ? (
              <p className="text-muted-foreground text-xs leading-5">
                {result}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
      <Card>
        <PanelTitle eyebrow="AVAILABLE DATA">Historical datasets</PanelTitle>
        <CardContent className="p-0">
          <SimpleTable
            headers={["Ticker", "Timeframe", "Candles", "From", "To", ""]}
            rows={(data?.historicalDatasets ?? []).map((dataset) => [
              dataset.symbol,
              `${dataset.interval_minutes}m`,
              dataset.candle_count.toLocaleString(),
              new Date(dataset.start_time).toLocaleDateString(),
              new Date(dataset.end_time).toLocaleDateString(),
              <Button
                key="sync"
                variant="outline"
                disabled={syncing !== null}
                onClick={() =>
                  void resync(dataset.symbol, dataset.interval_minutes)
                }
              >
                <RefreshCw data-icon="inline-start" />
                {syncing === `${dataset.symbol}-${dataset.interval_minutes}`
                  ? "Syncing…"
                  : "Sync to latest"}
              </Button>,
            ])}
            empty="No historical datasets stored yet."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function NewBacktest() {
  const { data, refresh } = useDashboard();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  if (!data) return null;
  const dashboardData = data;
  const markets = historicalMarketOptions(data.historicalDatasets);
  const market =
    markets.find((item) => item.symbol === selectedSymbol) ?? markets[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const strategy = dashboardData.strategyVersions.find(
      (item) => `${item.strategy_id}:${item.version}` === form.get("strategy"),
    );
    try {
      if (!strategy) throw new Error("Select a strategy");
      const ticket = await enqueueJob("/api/backtests", {
        ...Object.fromEntries(form),
        strategyId: strategy.strategy_id,
        strategyVersion: strategy.version,
      });
      setMessage(`Backtest queued as ${ticket.jobId}.`);
      await waitForJob(ticket);
      await refresh();
      navigate("/backtests");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backtest failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="NEW BACKTEST"
        title="Configure a backtest"
        description="Choose a saved strategy, market, timeframe, and historical period."
        action={
          <Button variant="outline" onClick={() => navigate("/backtests")}>
            <ArrowLeft className="size-4" />
            Back to history
          </Button>
        }
      />
      <Card className="max-w-3xl">
        <PanelTitle eyebrow="CONFIGURATION">Run parameters</PanelTitle>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Strategy">
                <select name="strategy" required defaultValue="">
                  <option value="" disabled>
                    Select a strategy
                  </option>
                  {data.strategyVersions
                    .filter((strategy) => strategy.active)
                    .map((strategy) => (
                      <option
                        key={`${strategy.strategy_id}-${strategy.version}`}
                        value={`${strategy.strategy_id}:${strategy.version}`}
                      >
                        {strategy.display_name} · {strategy.version}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Exchange">
                <select name="exchange" defaultValue="BYBIT">
                  <option value="BYBIT">Bybit</option>
                </select>
              </Field>
              <Field label="Market">
                <select
                  name="symbol"
                  value={market?.symbol ?? ""}
                  onChange={(event) => setSelectedSymbol(event.target.value)}
                  disabled={!market}
                >
                  {markets.map((item) => (
                    <option key={item.symbol}>{item.symbol}</option>
                  ))}
                </select>
              </Field>
              <Field label="Timeframe">
                <select
                  key={market?.symbol}
                  name="interval"
                  defaultValue={market?.intervals[0]}
                  disabled={!market}
                >
                  {(market?.intervals ?? []).map((interval) => (
                    <option key={interval} value={interval}>
                      {interval} minutes
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Total capital (USDT)">
                <input
                  name="totalCapital"
                  type="number"
                  defaultValue="10000"
                  min="1"
                  step="any"
                  required
                />
              </Field>
              <Field label="Minimum per trade">
                <input
                  name="minTradeAmount"
                  type="number"
                  defaultValue="100"
                  min="1"
                  step="any"
                  required
                />
              </Field>
              <Field label="Maximum per trade">
                <input
                  name="maxTradeAmount"
                  type="number"
                  defaultValue="200"
                  min="1"
                  step="any"
                  required
                />
              </Field>
              <Field label="Leverage">
                <input
                  name="leverage"
                  type="number"
                  defaultValue="2"
                  min="1"
                  step="any"
                  required
                />
              </Field>
              <Field label="Stop loss (%)">
                <input
                  name="stopLossPercent"
                  type="number"
                  defaultValue="1"
                  min="0.01"
                  step="any"
                  required
                />
              </Field>
              <Field label="Take profit (%)">
                <input
                  name="takeProfitPercent"
                  type="number"
                  defaultValue="2"
                  min="0.01"
                  step="any"
                  required
                />
              </Field>
              <Field label="Start date">
                <input name="start" type="date" required />
              </Field>
              <Field label="End date">
                <input name="end" type="date" required />
              </Field>
            </div>
            <p className="text-muted-foreground text-xs leading-5">
              The job uses stored historical candles only. Missing ranges or
              gaps fail safely.
            </p>
            <Button type="submit" disabled={submitting || !market}>
              <FlaskConical data-icon="inline-start" />
              {submitting ? "Running background job…" : "Queue backtest"}
            </Button>
            {message ? (
              <p className="text-muted-foreground text-xs leading-5">
                {message}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </>
  );
}

function Exchanges() {
  const { data } = useDashboard();
  if (!data) return null;
  return (
    <>
      <PageTitle
        eyebrow="EXCHANGES"
        title="Exchange connections"
        description="Configured execution venues and their current operational status."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {data.exchanges.map((exchange) => (
          <Card key={exchange.id}>
            <PanelTitle
              eyebrow={exchange.environment}
              action={
                <Badge
                  variant={
                    exchange.active
                      ? "default"
                      : exchange.connected
                        ? "warning"
                        : "outline"
                  }
                >
                  {exchange.active
                    ? "Active"
                    : exchange.connected
                      ? "Connected"
                      : "Disconnected"}
                </Badge>
              }
            >
              {exchange.name}
            </PanelTitle>
            <CardContent className="space-y-4">
              <Detail
                label="Connection"
                value={exchange.connected ? "Configured" : "Not configured"}
              />
              <Detail
                label="Order execution"
                value={exchange.active ? "Ready" : "Inactive"}
              />
              <Detail
                label="Market data"
                value={exchange.marketData ? "Available" : "Unavailable"}
              />
              <Detail label="Environment" value={exchange.environment} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function Analytics() {
  const [view, setView] = useState<"BACKTEST" | "LIVE">("BACKTEST");
  return (
    <>
      <PageTitle
        eyebrow="ANALYTICS"
        title="Performance analytics"
        description={
          view === "BACKTEST"
            ? "Aggregate deterministic backtest performance."
            : "Persisted paper/live trades and exchange execution activity."
        }
        action={
          <div
            className="flex rounded-md border p-1"
            role="group"
            aria-label="Analytics source"
          >
            <Button
              variant={view === "BACKTEST" ? "default" : "ghost"}
              onClick={() => setView("BACKTEST")}
            >
              Backtests
            </Button>
            <Button
              variant={view === "LIVE" ? "default" : "ghost"}
              onClick={() => setView("LIVE")}
            >
              Live trades
            </Button>
          </div>
        }
      />
      {view === "BACKTEST" ? <BacktestAnalytics /> : <LiveAnalytics />}
    </>
  );
}

function BacktestAnalytics() {
  const { data } = useDashboard();
  if (!data) return null;
  const runs = data.backtests;
  const totalTrades = runs.reduce(
    (sum, run) => sum + (run.metrics.totalTrades ?? 0),
    0,
  );
  const netProfit = runs.reduce(
    (sum, run) => sum + Number(run.metrics.netProfit ?? 0),
    0,
  );
  const averageReturn = runs.length
    ? runs.reduce(
        (sum, run) => sum + Number(run.metrics.returnPercent ?? 0),
        0,
      ) / runs.length
    : 0;
  const best = runs.reduce<(typeof runs)[number] | null>(
    (current, run) =>
      !current ||
      Number(run.metrics.returnPercent ?? 0) >
        Number(current.metrics.returnPercent ?? 0)
        ? run
        : current,
    null,
  );
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Backtest runs"
          value={String(runs.length)}
          note="Saved deterministic runs"
        />
        <Metric
          label="Backtest trades"
          value={String(totalTrades)}
          note="Across all strategies"
        />
        <Metric
          label="Combined net profit"
          value={`${netProfit >= 0 ? "+" : ""}$${money.format(netProfit)}`}
          note="Backtest results"
          tone={netProfit < 0 ? "text-destructive" : "text-primary"}
        />
        <Metric
          label="Average return"
          value={`${averageReturn.toFixed(2)}%`}
          note={best ? `Best: ${best.strategy_id}` : "No backtests yet"}
        />
      </div>
      <Card>
        <PanelTitle eyebrow="PERFORMANCE">Run comparison</PanelTitle>
        <CardContent className="p-0">
          <SimpleTable
            headers={[
              "Strategy",
              "Market",
              "Trades",
              "Net profit",
              "Return",
              "Win rate",
              "Max drawdown",
            ]}
            rows={runs.map((run) => [
              `${run.strategy_id} ${run.strategy_version}`,
              `${run.symbol} · ${run.interval_minutes}m`,
              run.metrics.totalTrades ?? 0,
              `$${money.format(Number(run.metrics.netProfit ?? 0))}`,
              percent(run.metrics.returnPercent),
              percent(run.metrics.winRatePercent),
              percent(run.metrics.maxDrawdownPercent),
            ])}
            empty="Run a backtest to populate analytics."
          />
        </CardContent>
      </Card>
    </>
  );
}

function LiveAnalytics() {
  const { data } = useDashboard();
  if (!data) return null;
  const { summary, trades, executionStates } = data.liveAnalytics;
  const winRate = summary.totalTrades
    ? (summary.winningTrades / summary.totalTrades) * 100
    : 0;
  const activeExecutions = executionStates
    .filter(
      (item) =>
        !["CLOSED", "CANCELLED", "REJECTED", "FAILED"].includes(item.state),
    )
    .reduce((sum, item) => sum + item.count, 0);
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Completed trades"
          value={String(summary.totalTrades)}
          note={`${summary.winningTrades} profitable`}
        />
        <Metric
          label="Net P&L"
          value={`${summary.netPnl >= 0 ? "+" : ""}$${money.format(summary.netPnl)}`}
          note="Persisted paper/live trades"
          tone={summary.netPnl < 0 ? "text-destructive" : "text-primary"}
        />
        <Metric
          label="Win rate"
          value={`${winRate.toFixed(2)}%`}
          note="Closed trades"
        />
        <Metric
          label="Fees"
          value={`$${money.format(summary.fees)}`}
          note={`${activeExecutions} active execution intents`}
        />
      </div>
      <Card className="mb-4">
        <PanelTitle eyebrow="EXECUTION">Exchange intent states</PanelTitle>
        <CardContent className="flex flex-wrap gap-2">
          {executionStates.length ? (
            executionStates.map((item) => (
              <Badge key={item.state} variant="outline">
                {item.state}: {item.count}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              No live execution activity yet.
            </span>
          )}
        </CardContent>
      </Card>
      <Card>
        <PanelTitle eyebrow="LIVE / PAPER">Trade log</PanelTitle>
        <CardContent className="p-0">
          <SimpleTable
            headers={[
              "Closed",
              "Strategy",
              "Market",
              "Side",
              "Quantity",
              "Entry",
              "Exit",
              "Fees",
              "Net P&L",
              "Reason",
            ]}
            rows={trades.map((trade) => [
              new Date(trade.closed_at).toLocaleString(),
              `${trade.strategy_id} ${trade.strategy_version}`,
              `${trade.symbol} · ${trade.interval_minutes}m`,
              trade.direction,
              price.format(trade.quantity),
              price.format(trade.entry_price),
              price.format(trade.exit_price),
              `$${money.format(trade.fees)}`,
              `${trade.net_pnl >= 0 ? "+" : ""}$${money.format(trade.net_pnl)}`,
              trade.exit_reason,
            ])}
            empty="No live or paper trades have closed yet."
          />
        </CardContent>
      </Card>
    </>
  );
}

function MarketPanel() {
  const { data, liveConnected } = useDashboard();
  if (!data) return null;
  return (
    <Card>
      <PanelTitle
        eyebrow="MARKET"
        action={
          <Badge variant={liveConnected ? "default" : "warning"}>
            {liveConnected ? "Live feed" : "Reconnecting"}
          </Badge>
        }
      >
        {data.symbol} perpetual · {data.interval}m
      </PanelTitle>
      <MarketChart candles={data.market.candles} />
      <div className="text-muted-foreground px-5 pb-3 text-right text-[9px]">
        Charts by{" "}
        <a
          className="hover:text-foreground underline"
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
        >
          TradingView
        </a>
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  note,
  tone = "",
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent>
        <span className="text-muted-foreground text-xs">{label}</span>
        <strong
          className={`my-3 block font-mono text-xl tracking-tight ${tone}`}
        >
          {value}
        </strong>
        <small className="text-muted-foreground text-[10px]">{note}</small>
      </CardContent>
    </Card>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border flex items-center justify-between gap-4 border-b pb-4 text-xs last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right">{value}</strong>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span className="text-muted-foreground mb-2 block text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span className="border-input bg-secondary block rounded-md border [&_input]:h-10 [&_input]:w-full [&_input]:bg-transparent [&_input]:px-3 [&_input]:outline-none [&_select]:h-10 [&_select]:w-full [&_select]:bg-transparent [&_select]:px-3 [&_select]:outline-none">
        {children}
      </span>
    </label>
  );
}
function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                className="text-muted-foreground border-border border-b px-5 py-3 text-[9px] tracking-wider whitespace-nowrap uppercase"
                key={header}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr className="border-border border-b last:border-0" key={rowIndex}>
              {row.map((value, index) => (
                <td
                  className="px-5 py-4 whitespace-nowrap"
                  key={`${rowIndex}-${headers[index]}`}
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
function percent(value: string | undefined) {
  return `${Number(value ?? 0).toFixed(2)}%`;
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="text-muted-foreground p-8 text-sm">{children}</div>;
}
function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <RefreshCw className="text-primary size-6 animate-spin" />
    </div>
  );
}
function NotFound() {
  return (
    <Card>
      <CardContent>
        <Empty>Page not found.</Empty>
      </CardContent>
    </Card>
  );
}
