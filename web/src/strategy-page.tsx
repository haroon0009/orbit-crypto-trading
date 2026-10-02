import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Strategy = {
  strategy_id: string;
  version: string;
  display_name: string;
  configuration: unknown;
  active: boolean;
  bot_count: number;
  active_bot_count: number;
};

export function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard");
    if (!response.ok) throw new Error("Could not load strategies");
    const data = (await response.json()) as { strategyVersions: Strategy[] };
    setStrategies(data.strategyVersions);
  }, []);

  useEffect(() => {
    refresh().catch((error: Error) => setMessage(error.message));
  }, [refresh]);

  async function request(strategy: Strategy, method: "PATCH" | "DELETE") {
    const path = `/api/strategies/${encodeURIComponent(strategy.strategy_id)}/${strategy.version}`;
    const response = await fetch(method === "PATCH" ? `${path}/status` : path, {
      method,
      headers:
        method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
      body:
        method === "PATCH"
          ? JSON.stringify({ active: !strategy.active })
          : undefined,
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) throw new Error(result.error ?? "Strategy update failed");
    setMessage(
      method === "DELETE" ? "Strategy deleted" : "Strategy status updated",
    );
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Strategies</h1>
        <p className="text-sm text-muted-foreground">
          Versioned strategy configurations used by bots.
        </p>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {message}
      </p>
      <div className="grid gap-4">
        {strategies.map((strategy) => (
          <section
            key={`${strategy.strategy_id}:${strategy.version}`}
            className="rounded-xl border bg-card p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{strategy.display_name}</h2>
                  <Badge variant={strategy.active ? "default" : "outline"}>
                    {strategy.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {strategy.strategy_id} · version {strategy.version}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={strategy.active && strategy.active_bot_count > 0}
                  onClick={() =>
                    request(strategy, "PATCH").catch((error: Error) =>
                      setMessage(error.message),
                    )
                  }
                >
                  {strategy.active ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={strategy.bot_count > 0}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${strategy.display_name} version ${strategy.version}?`,
                      )
                    ) {
                      request(strategy, "DELETE").catch((error: Error) =>
                        setMessage(error.message),
                      );
                    }
                  }}
                >
                  <Trash2 data-icon="inline-start" /> Delete
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted p-3 text-sm">
                Assigned bots: {strategy.bot_count} ({strategy.active_bot_count}{" "}
                active)
              </div>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                {JSON.stringify(strategy.configuration, null, 2)}
              </pre>
            </div>
          </section>
        ))}
        {!strategies.length && (
          <p className="rounded-xl border p-6 text-sm text-muted-foreground">
            No strategy versions found.
          </p>
        )}
      </div>
    </div>
  );
}
