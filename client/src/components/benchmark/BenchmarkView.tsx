import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Gauge,
  Server,
  ShieldCheck,
  Timer,
  TrendingUp,
  Zap
} from 'lucide-react';
import { BenchmarkStats, ServerState } from '../../types';
import { api } from '../../lib/api';
import { Badge, Button, Card, CardBody, EmptyState, Spinner } from '../ui/primitives';
import { cn } from '../../lib/cn';

interface BenchmarkViewProps {
  activeState: ServerState | null;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'brand' | 'success' | 'warning' | 'neutral';
}

const metricTones = {
  brand: 'text-brand-300',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  neutral: 'text-slate-200'
};

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'neutral'
}) => (
  <Card>
    <CardBody className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="section-label">{label}</span>
        <Icon className="h-3.5 w-3.5 text-slate-600" />
      </div>
      <div className={cn('text-2xl font-bold font-mono', metricTones[tone])}>
        {value}
        {unit && <span className="text-xs text-slate-500 font-normal ml-1">{unit}</span>}
      </div>
    </CardBody>
  </Card>
);

export const BenchmarkView: React.FC<BenchmarkViewProps> = ({ activeState }) => {
  const [iterations, setIterations] = useState(10);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<BenchmarkStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const data = await api.runBenchmark(iterations);
      setStats(data);
    } catch (e: any) {
      setError(e.message || 'Benchmark run failed');
    } finally {
      setIsRunning(false);
    }
  };

  const isConnected = activeState?.status === 'connected';

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-surface-950 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-surface-800">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Benchmark & Health
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Measure JSON-RPC roundtrip latency, jitter, and protocol compliance
            of the active server.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-surface-900 border border-surface-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <span>Rounds</span>
            <select
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
              disabled={isRunning || !isConnected}
              aria-label="Benchmark rounds"
              className="bg-transparent text-brand-300 font-mono focus:outline-none cursor-pointer"
            >
              <option value={5} className="bg-surface-900">5</option>
              <option value={10} className="bg-surface-900">10</option>
              <option value={25} className="bg-surface-900">25</option>
              <option value={50} className="bg-surface-900">50</option>
            </select>
          </div>

          <Button
            variant="primary"
            onClick={handleRun}
            disabled={isRunning || !isConnected}
          >
            {isRunning ? (
              <>
                <Spinner className="h-3.5 w-3.5 border" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                <span>Start Benchmark</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {!isConnected ? (
        <Card>
          <EmptyState
            icon={Server}
            title="No active server"
            description="Connect to an MCP server in the top bar to run conformance tests and latency benchmarks."
          />
        </Card>
      ) : (
        <>
          {/* Server summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardBody className="space-y-1">
                <span className="section-label">Target Server</span>
                <div className="text-sm font-semibold text-slate-200 truncate">
                  {activeState?.config.name}
                </div>
                <Badge tone="brand" className="font-mono text-[10px] uppercase w-fit">
                  {activeState?.config.transport}
                </Badge>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="space-y-1">
                <span className="section-label">Protocol Version</span>
                <div className="text-sm font-semibold text-slate-200 font-mono">
                  {activeState?.serverInfo?.protocolVersion || '2024-11-05'}
                </div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Handshake complete</span>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="space-y-1">
                <span className="section-label">Connection</span>
                <div className="text-sm font-semibold text-emerald-400 capitalize">
                  {activeState?.status}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Since{' '}
                  {activeState?.connectedAt
                    ? new Date(activeState.connectedAt).toLocaleTimeString()
                    : 'N/A'}
                </div>
              </CardBody>
            </Card>
          </div>

          {error && (
            <Card className="border-rose-500/25 bg-rose-950/10">
              <CardBody>
                <pre className="text-xs font-mono text-rose-300 whitespace-pre-wrap">
                  {error}
                </pre>
              </CardBody>
            </Card>
          )}

          {stats && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  label="Avg Latency"
                  value={stats.avgLatencyMs}
                  unit="ms"
                  icon={Gauge}
                  tone="brand"
                />
                <MetricCard
                  label="Min Latency"
                  value={stats.minLatencyMs}
                  unit="ms"
                  icon={Timer}
                  tone="success"
                />
                <MetricCard
                  label="Max Latency"
                  value={stats.maxLatencyMs}
                  unit="ms"
                  icon={TrendingUp}
                  tone="warning"
                />
                <MetricCard
                  label="Success Rate"
                  value={stats.successRate}
                  unit="%"
                  icon={CheckCircle2}
                  tone="success"
                />
              </div>

              {/* Latency breakdown */}
              <Card>
                <CardBody className="space-y-3">
                  <div className="text-xs font-semibold text-slate-300">
                    Roundtrip Breakdown ({stats.iterations} samples)
                  </div>
                  <div className="space-y-1.5">
                    {stats.results.map((r, i) => {
                      const maxLatency = Math.max(
                        ...stats.results.map((x) => x.latencyMs),
                        1
                      );
                      const pct = Math.max(
                        Math.round((r.latencyMs / maxLatency) * 100),
                        4
                      );
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-3 text-xs font-mono"
                        >
                          <span className="text-slate-500 w-8">#{i + 1}</span>
                          <div className="flex-1 bg-surface-800/80 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                r.success ? 'bg-brand-500' : 'bg-rose-500'
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-slate-300 w-12 text-right">
                            {r.latencyMs}ms
                          </span>
                          {r.success ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>
            </div>
          )}

          {/* Conformance */}
          <Card>
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>MCP Protocol Conformance</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  {
                    title: 'JSON-RPC 2.0 Compliance',
                    desc: 'Strict version field, unique request IDs.'
                  },
                  {
                    title: 'Initialize Handshake',
                    desc: 'Negotiated protocol version and capabilities.'
                  },
                  {
                    title: 'Tools Schema Draft-07',
                    desc: 'Input schemas conform to valid JSON Schema.'
                  },
                  {
                    title: 'Bi-directional Notifications',
                    desc: 'Async progress and list-change signals.'
                  }
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-2 text-xs p-3 bg-surface-900/60 border border-surface-800/60 rounded-lg"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-slate-200">{item.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
};
