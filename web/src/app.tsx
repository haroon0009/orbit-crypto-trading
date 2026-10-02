import {
  Activity,
  Bot,
  ChartCandlestick,
  LayoutDashboard,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, Route, Routes } from "react-router";

import { MarketChart } from "@/components/market-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { timeAgo, useDashboard } from "@/dashboard";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const price = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

const navigation = [
  ["/", "Overview", LayoutDashboard],
  ["/market", "Market", ChartCandlestick],
  ["/positions", "Positions", WalletCards],
  ["/activity", "Activity", Activity],
  ["/risk", "Risk monitor", ShieldCheck],
  ["/strategies", "Strategies", SlidersHorizontal],
] as const;

function Shell() {
  const {
    data,
    error,
    loading,
    symbol,
    interval,
    setSymbol,
    setInterval,
    refresh,
  } = useDashboard();
  return (
    <div className="bg-background min-h-screen">
      <aside className="border-border bg-sidebar fixed inset-y-0 left-0 z-20 hidden w-56 border-r md:flex md:flex-col">
        <div className="flex h-20 items-center gap-3 px-6 text-sm font-black tracking-[.18em]">
          <span className="bg-primary text-primary-foreground grid size-8 place-items-center [clip-path:polygon(50%_0,92%_24%,92%_76%,50%_100%,8%_76%,8%_24%)]">
            O
          </span>
          ORBIT
        </div>
        <nav className="grid gap-1 px-3">
          {navigation.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex h-11 items-center gap-3 border-l-2 px-3 text-sm transition-colors ${
                  isActive
                    ? "border-primary bg-primary/8 text-foreground"
                    : "text-muted-foreground hover:bg-accent border-transparent hover:text-foreground"
                }`
              }
            >
              <Icon className="size-4" /> {label}
              {to === "/strategies" && (
                <span className="ml-auto text-[9px] uppercase">Phase 7</span>
              )}
            </NavLink>
          ))}
        </nav>
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

      <main className="min-h-screen md:ml-56">
        <header className="border-border bg-background/95 sticky top-0 z-10 flex min-h-20 flex-wrap items-center justify-between gap-4 border-b px-4 py-4 backdrop-blur md:px-8">
          <div>
            <p className="text-primary text-[10px] font-bold tracking-[.16em]">
              TRADING OPERATIONS
            </p>
            <h1 className="text-xl font-semibold">Bot console</h1>
          </div>
          <div className="flex items-end gap-2">
            <Control label="Market">
              <select
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
              >
                <option>BTCUSDT</option>
                <option>ETHUSDT</option>
              </select>
            </Control>
            <Control label="Interval">
              <select
                value={interval}
                onChange={(event) => setInterval(Number(event.target.value))}
              >
                <option value="5">5m</option>
                <option value="15">15m</option>
                <option value="60">1h</option>
                <option value="240">4h</option>
                <option value="1440">1d</option>
              </select>
            </Control>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Refresh dashboard"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </header>
        <div className="mx-auto max-w-[1600px] p-4 md:p-8">
          {error && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive mb-4 border p-3 text-sm">
              {error}
            </div>
          )}
          {!data && loading ? (
            <Loading />
          ) : (
            <Routes>
              <Route index element={<Overview />} />
              <Route path="market" element={<Market />} />
              <Route path="positions" element={<Positions />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="risk" element={<Risk />} />
              <Route path="strategies" element={<Strategies />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          )}
        </div>
      </main>
    </div>
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
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5">
      <p className="text-primary mb-1 text-[10px] font-bold tracking-[.16em]">
        {eyebrow}
      </p>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
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

function Overview() {
  const { data } = useDashboard();
  if (!data) return null;
  const paper = data.paper;
  return (
    <>
      <PageTitle
        eyebrow="OVERVIEW"
        title="Command center"
        description="Market, account, and execution state at a glance."
      />
      <StatusStrip />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Paper equity"
          value={paper ? `$${money.format(paper.equity)}` : "—"}
          note={
            paper
              ? paper.dryRun
                ? "Dry-run account"
                : "Paper account"
              : "No paper account"
          }
        />
        <Metric
          label="Available balance"
          value={paper ? `$${money.format(paper.balance)}` : "—"}
          note="USDT"
        />
        <Metric
          label="Daily realized P&L"
          value={
            paper
              ? `${paper.dailyPnl >= 0 ? "+" : ""}$${money.format(paper.dailyPnl)}`
              : "—"
          }
          note={
            paper?.trades.length
              ? `${paper.trades.length} recent trades`
              : "Awaiting trades"
          }
          tone={
            paper && paper.dailyPnl < 0 ? "text-destructive" : "text-primary"
          }
        />
        <Metric
          label="Last price"
          value={
            data.market.lastPrice === null
              ? "—"
              : `$${price.format(data.market.lastPrice)}`
          }
          note={
            data.market.changePercent === null
              ? "No market data"
              : `${data.market.changePercent >= 0 ? "+" : ""}${data.market.changePercent.toFixed(2)}% · 500 candles`
          }
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(250px,1fr)]">
        <MarketPanel />
        <ExecutionHealth />
      </div>
    </>
  );
}

function StatusStrip() {
  const { data } = useDashboard();
  if (!data) return null;
  const items = [
    [
      data.mode,
      "TRADING MODE",
      data.mode === "LIVE" ? "destructive" : "warning",
    ],
    [
      data.market.fresh
        ? "LIVE"
        : data.market.candles.length
          ? "STALE"
          : "NO DATA",
      "MARKET DATA",
      data.market.fresh ? "default" : "warning",
    ],
    [
      data.testnet?.ready ? "READY" : "NOT READY",
      "EXECUTION",
      data.testnet?.ready ? "default" : "warning",
    ],
    [timeAgo(data.generatedAt), "LAST REFRESH", "outline"],
  ] as const;
  return (
    <Card className="mb-4 grid grid-cols-2 lg:grid-cols-4">
      {items.map(([value, label, variant], index) => (
        <div
          key={label}
          className={`p-4 ${index < 3 ? "border-border lg:border-r" : ""}`}
        >
          <Badge variant={variant}>{value}</Badge>
          <span className="text-muted-foreground mt-2 block text-[9px] tracking-wider">
            {label}
          </span>
        </div>
      ))}
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

function MarketPanel() {
  const { data } = useDashboard();
  if (!data) return null;
  return (
    <Card>
      <PanelTitle
        eyebrow="MARKET"
        action={
          <Badge variant={data.market.fresh ? "default" : "warning"}>
            {data.market.fresh ? "Live" : "Stale"}
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

function ExecutionHealth() {
  const { data } = useDashboard();
  if (!data) return null;
  const rows = [
    ["Database", "Connected", true],
    [
      "Public market feed",
      data.market.fresh ? "Current" : "Stale",
      data.market.fresh,
    ],
    [
      "Testnet reconciliation",
      data.testnet?.last_reconciled_at
        ? timeAgo(data.testnet.last_reconciled_at)
        : "Not run",
      Boolean(data.testnet?.ready),
    ],
    [
      "Order routing",
      data.testnet?.ready ? "Enabled" : "Blocked",
      Boolean(data.testnet?.ready),
    ],
    [
      "Paper mode",
      data.paper
        ? data.paper.dryRun
          ? "Dry run"
          : "Active"
        : "Not configured",
      Boolean(data.paper),
    ],
  ] as const;
  return (
    <Card>
      <PanelTitle eyebrow="SYSTEM">Execution health</PanelTitle>
      <CardContent className="space-y-4">
        {rows.map(([label, value, good]) => (
          <div
            key={label}
            className="border-border flex justify-between gap-4 border-b pb-4 text-xs last:border-0"
          >
            <span className="text-muted-foreground">{label}</span>
            <strong className={good ? "text-primary" : "text-warning"}>
              {value}
            </strong>
          </div>
        ))}
        <div className="border-info bg-info/5 border-l-2 p-3">
          <span className="text-info text-[9px] font-bold tracking-wider">
            SAFETY
          </span>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            This console is read-only. It cannot place, cancel, or modify
            orders.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Market() {
  const { data } = useDashboard();
  if (!data) return null;
  return (
    <>
      <PageTitle
        eyebrow="MARKET"
        title={`${data.symbol} market`}
        description="Stored Bybit candles rendered from the bot's own dataset."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Last price"
          value={
            data.market.lastPrice === null
              ? "—"
              : `$${price.format(data.market.lastPrice)}`
          }
          note={`${data.interval} minute candles`}
        />
        <Metric
          label="Window change"
          value={
            data.market.changePercent === null
              ? "—"
              : `${data.market.changePercent.toFixed(2)}%`
          }
          note="Latest 500 candles"
        />
        <Metric
          label="Last candle"
          value={timeAgo(data.market.lastCandleAt)}
          note={data.market.fresh ? "Feed current" : "Feed stale"}
        />
      </div>
      <MarketPanel />
    </>
  );
}

function Positions() {
  const { data } = useDashboard();
  if (!data) return null;
  const position = data.paper?.position;
  return (
    <>
      <PageTitle
        eyebrow="PAPER"
        title="Positions and orders"
        description="Current simulated exposure and recent paper orders."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <PanelTitle eyebrow="EXPOSURE">Active position</PanelTitle>
          <CardContent>
            {position ? (
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
                {[
                  ["Direction", position.direction],
                  ["Quantity", position.quantity],
                  ["Entry", price.format(position.entry_price)],
                  ["Stop loss", price.format(position.stop_loss)],
                  ["Take profit", price.format(position.take_profit)],
                  ["Opened", timeAgo(position.opened_at)],
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
              <Empty>No open paper position.</Empty>
            )}
          </CardContent>
        </Card>
        <Card>
          <PanelTitle eyebrow="ORDERS">Recent orders</PanelTitle>
          <CardContent className="p-0">
            <SimpleTable
              headers={["Created", "Side", "Type", "Status", "Qty"]}
              rows={(data.paper?.orders ?? []).map((order) => [
                timeAgo(order.created_at),
                order.side,
                order.order_type.replaceAll("_", " "),
                order.status,
                order.quantity ?? "—",
              ])}
              empty="No paper orders yet."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ActivityPage() {
  const { data } = useDashboard();
  if (!data) return null;
  return (
    <>
      <PageTitle
        eyebrow="LEDGER"
        title="Trading activity"
        description="Completed paper trades and realized outcomes."
      />
      <Card>
        <PanelTitle eyebrow="PAPER TRADES">Recent trades</PanelTitle>
        <CardContent className="p-0">
          <SimpleTable
            headers={["Closed", "Side", "Entry", "Exit", "Reason", "Net P&L"]}
            rows={(data.paper?.trades ?? []).map((trade) => [
              new Date(trade.closed_at).toLocaleString(),
              trade.direction,
              price.format(trade.entry_price),
              price.format(trade.exit_price),
              trade.exit_reason.replaceAll("_", " "),
              `${trade.net_pnl >= 0 ? "+" : ""}$${money.format(trade.net_pnl)}`,
            ])}
            empty="No completed paper trades yet."
          />
        </CardContent>
      </Card>
    </>
  );
}

function Risk() {
  const { data } = useDashboard();
  if (!data) return null;
  return (
    <>
      <PageTitle
        eyebrow="CONTROLS"
        title="Risk monitor"
        description="Most recent accepted and rejected decisions from the central risk engine."
      />
      <Card>
        <PanelTitle eyebrow="DECISIONS">Recent evaluations</PanelTitle>
        <CardContent className="space-y-1">
          {data.risk.length ? (
            data.risk.map((decision, index) => (
              <div
                className="border-border flex items-center gap-3 border-b py-4 last:border-0"
                key={`${decision.occurred_at}-${index}`}
              >
                <span
                  className={`size-2 rounded-full ${decision.accepted ? "bg-primary" : "bg-destructive"}`}
                />
                <span className="text-sm">
                  {decision.reason_code.replaceAll("_", " ")}
                </span>
                <Badge
                  className="ml-auto"
                  variant={decision.accepted ? "default" : "destructive"}
                >
                  {decision.accepted ? "Accepted" : "Rejected"}
                </Badge>
                <time className="text-muted-foreground w-16 text-right text-[10px]">
                  {timeAgo(decision.occurred_at)}
                </time>
              </div>
            ))
          ) : (
            <Empty>No risk decisions recorded yet.</Empty>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Strategies() {
  return (
    <>
      <PageTitle
        eyebrow="PHASE 7"
        title="Strategy assignments"
        description="Assign versioned strategies to an exchange, symbol, and timeframe."
      />
      <Card className="border-dashed">
        <CardContent className="grid min-h-72 place-items-center text-center">
          <div>
            <Bot className="text-primary mx-auto mb-4 size-10" />
            <h3 className="font-semibold">Coming in Phase 7</h3>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
              The route is ready. Configuration controls will be added with
              strategy versioning and operational safeguards.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
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
                className="text-muted-foreground border-border border-b px-5 py-3 text-[9px] tracking-wider uppercase"
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
export default Shell;
