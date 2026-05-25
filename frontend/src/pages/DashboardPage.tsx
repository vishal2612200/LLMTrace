import React from "react";
import { AlertTriangle, Gauge, LineChart, RotateCw, Server } from "lucide-react";

import { api, DlqEntry, MetricsSummary, ProviderMetric, TimeseriesPoint } from "../api/client";

export function DashboardPage() {
  const [summary, setSummary] = React.useState<MetricsSummary | null>(null);
  const [series, setSeries] = React.useState<TimeseriesPoint[]>([]);
  const [providers, setProviders] = React.useState<ProviderMetric[]>([]);
  const [dlq, setDlq] = React.useState<DlqEntry[]>([]);

  async function load() {
    const [a, b, c, d] = await Promise.all([
      api.metricsSummary(),
      api.metricsTimeseries(),
      api.metricsProviders(),
      api.dlq().catch(() => []),
    ]);
    setSummary(a);
    setSeries(b);
    setProviders(c);
    setDlq(d);
  }

  React.useEffect(() => {
    void load();
  }, []);

  const maxRequests = Math.max(1, ...series.map((point) => point.requests));

  return (
    <section className="workspace">
      <header className="toolbar">
        <div>
          <h1>Inference Dashboard</h1>
          <p>Near-real-time metrics from processed ingestion events.</p>
        </div>
        <button onClick={() => void load()}>
          <RotateCw size={18} /> Refresh
        </button>
      </header>

      <div className="metric-grid">
        <Metric icon={<Server />} label="Requests" value={summary?.total_requests ?? 0} />
        <Metric
          icon={<Gauge />}
          label="Latency"
          value={`${summary?.p50_latency_ms ?? 0}/${summary?.p95_latency_ms ?? 0} ms`}
        />
        <Metric icon={<AlertTriangle />} label="Error rate" value={`${Math.round((summary?.error_rate ?? 0) * 100)}%`} />
        <Metric icon={<LineChart />} label="Tokens" value={summary?.total_tokens ?? 0} />
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Throughput</h2>
          <div className="bars">
            {series.length === 0 ? (
              <span>No processed events yet.</span>
            ) : (
              series.map((point) => (
                <div className="bar-row" key={point.bucket}>
                  <span>{new Date(point.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <div className="bar-track">
                    <div style={{ width: `${(point.requests / maxRequests) * 100}%` }} />
                  </div>
                  <strong>{point.requests}</strong>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Provider mix</h2>
          <div className="provider-list">
            {providers.length === 0 ? (
              <span>No provider metrics yet.</span>
            ) : (
              providers.map((provider) => (
                <div className="provider-row" key={`${provider.provider}-${provider.model}`}>
                  <div>
                    <strong>{provider.provider}</strong>
                    <span>{provider.model}</span>
                  </div>
                  <span>{provider.requests} req</span>
                  <span>{provider.tokens} tok</span>
                  <span>{provider.errors} err</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Recent failures</h2>
          <div className="provider-list">
            {(summary?.recent_failures.length ?? 0) === 0 ? (
              <span>No failed requests.</span>
            ) : (
              summary?.recent_failures.map((failure) => (
                <div className="provider-row" key={String(failure.id)}>
                  <div>
                    <strong>{String(failure.provider)} / {String(failure.model)}</strong>
                    <span>{String(failure.error_type ?? "request_failed")}</span>
                  </div>
                  <span>{String(failure.latency_ms ?? 0)} ms</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Dead-letter queue</h2>
          <div className="provider-list">
            {dlq.length === 0 ? (
              <span>No failed ingestion events.</span>
            ) : (
              dlq.map((entry) => (
                <div className="provider-row" key={entry.id}>
                  <div>
                    <strong>{entry.id}</strong>
                    <span>{entry.error ?? "Failed event"}</span>
                  </div>
                  <button
                    onClick={async () => {
                      await api.replayDlq(entry.id);
                      await load();
                    }}
                  >
                    Replay
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
