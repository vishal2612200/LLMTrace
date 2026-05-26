import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Gauge,
  LineChart,
  RotateCw,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { api, DlqEntry, getRuntimeSettings, MetricsSummary, ProviderMetric, TimeseriesPoint } from "../api/client";

export function DashboardPage({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [summary, setSummary] = React.useState<MetricsSummary | null>(null);
  const [series, setSeries] = React.useState<TimeseriesPoint[]>([]);
  const [providers, setProviders] = React.useState<ProviderMetric[]>([]);
  const [dlq, setDlq] = React.useState<DlqEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [replayingId, setReplayingId] = React.useState<string | null>(null);
  const [expandedFailureId, setExpandedFailureId] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  async function load() {
    setIsRefreshing(true);
    setLoadError(null);
    try {
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
      setLastUpdated(new Date());
    } catch (error) {
      setLoadError(formatDashboardLoadError(error));
    } finally {
      setIsRefreshing(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  const maxRequests = Math.max(1, ...series.map((point) => point.requests));
  const maxProviderRequests = Math.max(1, ...providers.map((provider) => provider.requests));
  const totalErrors = series.reduce((total, point) => total + point.errors, 0);
  const p95Peak = Math.max(0, ...series.map((point) => point.p95_latency_ms));
  const healthy = !loadError && (summary?.error_rate ?? 0) < 0.01 && dlq.length === 0;
  const isInitialLoading = isRefreshing && !summary && series.length === 0 && providers.length === 0;
  const errorRateLabel = formatPercent(summary?.error_rate ?? 0);

  return (
    <section className="workspace dashboard-premium">
      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <div className="status-strip">
            <span className={healthy ? "status-dot live" : "status-dot warn"} />
            <span>{healthy ? "Pipeline healthy" : "Needs attention"}</span>
            <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Awaiting sync"}</span>
          </div>
          <h1>Inference Dashboard</h1>
          <p>Near-real-time ingestion health, provider performance, latency pressure, and recovery queues.</p>
          <div className="dashboard-health-rail" aria-label="Pipeline summary">
            <span><strong>{formatNumber(summary?.total_requests ?? 0)}</strong> requests</span>
            <span><strong>{errorRateLabel}</strong> error rate</span>
            <span><strong>{dlq.length}</strong> DLQ pending</span>
          </div>
        </div>
        <button className="primary dashboard-refresh" onClick={() => void load()} disabled={isRefreshing} aria-label="Refresh dashboard metrics">
          <RotateCw className={isRefreshing ? "spin" : ""} size={18} /> {isRefreshing ? "Refreshing" : "Refresh"}
        </button>
      </header>

      {loadError && (
        <div className="dashboard-alert" role="alert">
          <AlertTriangle size={18} />
          <span>{loadError}</span>
          {onOpenSettings && (
            <button onClick={onOpenSettings}>
              Settings
            </button>
          )}
        </div>
      )}

      <div className="metric-grid dashboard-metrics">
        <Metric
          icon={<Server />}
          label="Requests"
          value={formatNumber(summary?.total_requests ?? 0)}
          note="Processed events"
          tone="blue"
          loading={isInitialLoading}
        />
        <Metric
          icon={<Gauge />}
          label="Latency"
          value={`${summary?.p50_latency_ms ?? 0}/${summary?.p95_latency_ms ?? 0} ms`}
          note="p50 / p95"
          tone="teal"
          loading={isInitialLoading}
        />
        <Metric
          icon={<ShieldCheck />}
          label="Error rate"
          value={errorRateLabel}
          note={`${totalErrors} errors in window`}
          tone={(summary?.error_rate ?? 0) > 0 ? "amber" : "green"}
          loading={isInitialLoading}
        />
        <Metric
          icon={<LineChart />}
          label="Tokens"
          value={formatNumber(summary?.total_tokens ?? 0)}
          note="Total usage"
          tone="violet"
          loading={isInitialLoading}
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel dashboard-panel throughput-panel">
          <PanelTitle icon={<Zap size={18} />} title="Throughput" meta={`${series.length} buckets`} />
          <div className="chart-frame">
            {isInitialLoading ? (
              <SkeletonRows count={8} />
            ) : series.length === 0 ? (
              <EmptyState title="No processed events yet." detail="Send traffic through ingestion to populate throughput." />
            ) : (
              series.map((point) => (
                <div className="bar-row" key={point.bucket}>
                  <span>{new Date(point.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <div className="bar-track" role="meter" aria-label={`${point.requests} requests at ${new Date(point.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`} aria-valuenow={point.requests} aria-valuemin={0} aria-valuemax={maxRequests}>
                    <div style={{ width: `${(point.requests / maxRequests) * 100}%` }} />
                  </div>
                  <strong>{point.requests}</strong>
                  <small>{point.errors} err</small>
                </div>
              ))
            )}
          </div>
          <div className="panel-footer">
            <span>Peak p95 latency</span>
            <strong>{p95Peak} ms</strong>
          </div>
        </section>

        <section className="panel dashboard-panel">
          <PanelTitle icon={<Server size={18} />} title="Provider mix" meta={`${providers.length} models`} />
          <div className="provider-list">
            {isInitialLoading ? (
              <SkeletonRows count={4} />
            ) : providers.length === 0 ? (
              <EmptyState title="No provider metrics yet." detail="Provider and model usage appears after requests complete." />
            ) : (
              providers.map((provider) => (
                <div className="provider-row provider-row-premium" key={`${provider.provider}-${provider.model}`}>
                  <div>
                    <strong>{provider.provider}</strong>
                    <span>{provider.model}</span>
                  </div>
                  <div className="provider-meter" aria-hidden="true">
                    <span style={{ width: `${(provider.requests / maxProviderRequests) * 100}%` }} />
                  </div>
                  <span>{formatNumber(provider.requests)} req</span>
                  <span>{formatNumber(provider.tokens)} tok</span>
                  <span className={provider.errors > 0 ? "danger-text" : "success-text"}>{provider.errors} err</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel dashboard-panel">
          <PanelTitle icon={<AlertTriangle size={18} />} title="Recent failures" meta="Latest request errors" />
          <div className="provider-list">
            {isInitialLoading ? (
              <SkeletonRows count={3} />
            ) : (summary?.recent_failures.length ?? 0) === 0 ? (
              <EmptyState title="No failed requests." detail="Completed requests are currently clear." />
            ) : (
              summary?.recent_failures.map((failure) => (
                <FailureRow
                  expanded={expandedFailureId === String(failure.id)}
                  failure={failure}
                  key={String(failure.id)}
                  onToggle={() =>
                    setExpandedFailureId((current) => (current === String(failure.id) ? null : String(failure.id)))
                  }
                />
              ))
            )}
          </div>
        </section>

        <section className="panel dashboard-panel">
          <PanelTitle icon={<Clock3 size={18} />} title="Dead-letter queue" meta={`${dlq.length} pending`} />
          <div className="provider-list">
            {isInitialLoading ? (
              <SkeletonRows count={3} />
            ) : dlq.length === 0 ? (
              <EmptyState title="No failed ingestion events." detail="Replay queue is empty." />
            ) : (
              dlq.map((entry) => (
                <div className="provider-row failure-row" key={entry.id}>
                  <div>
                    <strong>{entry.id}</strong>
                    <span>{entry.error ?? "Failed event"}</span>
                  </div>
                  <button
                    disabled={replayingId === entry.id}
                    onClick={async () => {
                      setReplayingId(entry.id);
                      setLoadError(null);
                      try {
                        await api.replayDlq(entry.id);
                        await load();
                      } catch (error) {
                        setLoadError(error instanceof Error ? error.message : `Unable to replay ${entry.id}.`);
                      } finally {
                        setReplayingId(null);
                      }
                    }}
                  >
                    {replayingId === entry.id ? "Replaying" : "Replay"}
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

function FailureRow({
  expanded,
  failure,
  onToggle,
}: {
  expanded: boolean;
  failure: Record<string, string | number | null>;
  onToggle: () => void;
}) {
  const errorType = String(failure.error_type ?? "request_failed");
  const errorMessage = String(failure.error_message ?? "No error message was recorded.");
  const createdAt = typeof failure.created_at === "string" ? new Date(failure.created_at).toLocaleString() : "Unknown time";
  const latency = typeof failure.latency_ms === "number" ? `${failure.latency_ms} ms` : "n/a";

  return (
    <article className={`failure-row-card ${expanded ? "expanded" : ""}`}>
      <button
        className="failure-row-toggle"
        aria-expanded={expanded}
        aria-label={`Show error details for ${String(failure.provider)} / ${String(failure.model)}`}
        onClick={onToggle}
      >
        <div>
          <strong>{String(failure.provider)} / {String(failure.model)}</strong>
          <span>{errorType}</span>
        </div>
        <span>{latency}</span>
        <ChevronDown className="failure-chevron" size={17} />
      </button>
      {expanded && (
        <div className="failure-detail">
          <dl>
            <div>
              <dt>Request</dt>
              <dd>{String(failure.id)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{createdAt}</dd>
            </div>
            <div>
              <dt>Error type</dt>
              <dd>{errorType}</dd>
            </div>
          </dl>
          <pre>{errorMessage}</pre>
        </div>
      )}
    </article>
  );
}

function formatDashboardLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to load dashboard metrics.";
  const apiBase = getRuntimeSettings().apiBase;
  if (message === "Failed to fetch" || message.includes("NetworkError")) {
    return `Cannot reach API at ${apiBase}. Start the backend or update API base in Settings.`;
  }
  return `Unable to load dashboard metrics from ${apiBase}: ${message}`;
}

function Metric({
  icon,
  label,
  value,
  note,
  tone,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  note: string;
  tone: "blue" | "teal" | "green" | "amber" | "violet";
  loading?: boolean;
}) {
  return (
    <div className={`metric dashboard-metric ${tone}`}>
      <span className="metric-icon">{icon}</span>
      <small>{label}</small>
      {loading ? (
        <>
          <span className="skeleton skeleton-value" />
          <span className="skeleton skeleton-note" />
        </>
      ) : (
        <>
          <strong>{value}</strong>
          <em>{note}</em>
        </>
      )}
    </div>
  );
}

function PanelTitle({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
  return (
    <div className="panel-title">
      <div>
        <span>{icon}</span>
        <h2>{title}</h2>
      </div>
      <small>{meta}</small>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mini-empty">
      <CheckCircle2 size={18} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value > 9999 ? "compact" : "standard" }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value > 0 && value < 0.01 ? 2 : 1,
    style: "percent",
  }).format(value);
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span className="skeleton skeleton-row" key={index} />
      ))}
    </div>
  );
}
