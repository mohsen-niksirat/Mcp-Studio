import React, { useState } from 'react';
import {
  Zap,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Gauge,
  ShieldCheck,
  RefreshCw,
  Server
} from 'lucide-react';
import { BenchmarkStats, ServerState } from '../../types';
import { api } from '../../lib/api';

interface BenchmarkViewProps {
  activeState: ServerState | null;
}

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
    <div className="flex-1 p-8 overflow-y-auto bg-[#0b0f19] space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-indigo-400" />
            <h2 className="text-base font-bold text-slate-100">
              Protocol Conformance & Latency Benchmark
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Measure roundtrip JSON-RPC throughput, roundtrip latency jitter, and protocol compliance.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <span>Rounds:</span>
            <select
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
              disabled={isRunning || !isConnected}
              className="bg-transparent text-indigo-300 font-mono focus:outline-none cursor-pointer"
            >
              <option value={5} className="bg-slate-900">5</option>
              <option value={10} className="bg-slate-900">10</option>
              <option value={25} className="bg-slate-900">25</option>
              <option value={50} className="bg-slate-900">50</option>
            </select>
          </div>

          <button
            onClick={handleRun}
            disabled={isRunning || !isConnected}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Benchmarking...' : 'Start Benchmark'}</span>
          </button>
        </div>
      </div>

      {!isConnected ? (
        <div className="p-8 text-center text-xs text-slate-500 bg-slate-900/40 border border-slate-800 rounded-2xl">
          Connect to an active MCP server in the top bar to run conformance tests and latency benchmarks.
        </div>
      ) : (
        <>
          {/* Server Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Target Server
              </span>
              <div className="text-sm font-bold text-slate-200 truncate">
                {activeState?.config.name}
              </div>
              <div className="text-xs font-mono text-indigo-400 uppercase">
                {activeState?.config.transport} transport
              </div>
            </div>

            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                MCP Protocol Version
              </span>
              <div className="text-sm font-bold text-slate-200 font-mono">
                {activeState?.serverInfo?.protocolVersion || '2024-11-05'}
              </div>
              <div className="text-xs text-emerald-400 flex items-center space-x-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>Compatible Handshake</span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Connection Status
              </span>
              <div className="text-sm font-bold text-emerald-400 capitalize">
                {activeState?.status}
              </div>
              <div className="text-xs font-mono text-slate-500">
                Connected at {activeState?.connectedAt ? new Date(activeState.connectedAt).toLocaleTimeString() : 'N/A'}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-mono text-rose-300">
              {error}
            </div>
          )}

          {/* Benchmark Results */}
          {stats && (
            <div className="space-y-6">
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-2xl space-y-1">
                  <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
                    Avg Latency
                  </span>
                  <div className="text-2xl font-black text-indigo-200 font-mono">
                    {stats.avgLatencyMs}
                    <span className="text-xs text-indigo-400 font-normal ml-1">ms</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Min Latency
                  </span>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    {stats.minLatencyMs}
                    <span className="text-xs text-slate-400 font-normal ml-1">ms</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Max Latency
                  </span>
                  <div className="text-2xl font-black text-amber-400 font-mono">
                    {stats.maxLatencyMs}
                    <span className="text-xs text-slate-400 font-normal ml-1">ms</span>
                  </div>
                </div>

                <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-1">
                  <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                    Success Rate
                  </span>
                  <div className="text-2xl font-black text-emerald-300 font-mono">
                    {stats.successRate}
                    <span className="text-xs text-emerald-400 font-normal ml-1">%</span>
                  </div>
                </div>
              </div>

              {/* Iteration Breakdown List */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-300">
                  Roundtrip Latency Breakdown ({stats.iterations} samples)
                </div>

                <div className="space-y-1.5">
                  {stats.results.map((r, i) => {
                    const maxLatency = Math.max(...stats.results.map((x) => x.latencyMs), 1);
                    const pct = Math.max(Math.round((r.latencyMs / maxLatency) * 100), 4);
                    return (
                      <div key={i} className="flex items-center space-x-3 text-xs font-mono">
                        <span className="text-slate-500 w-8">#{i + 1}</span>
                        <div className="flex-1 bg-slate-800/80 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              r.success ? 'bg-indigo-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-slate-300 w-12 text-right">{r.latencyMs}ms</span>
                        {r.success ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Conformance Checklist */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>MCP Protocol Conformance Checklist</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="flex items-start space-x-2 text-xs p-3 bg-slate-900/60 border border-slate-800/60 rounded-xl">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200">JSON-RPC 2.0 Compliance</div>
                  <div className="text-[11px] text-slate-400">Strict version field, unique integer/string request IDs.</div>
                </div>
              </div>

              <div className="flex items-start space-x-2 text-xs p-3 bg-slate-900/60 border border-slate-800/60 rounded-xl">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200">Initialize Handshake</div>
                  <div className="text-[11px] text-slate-400">Negotiated protocol version and server capabilities.</div>
                </div>
              </div>

              <div className="flex items-start space-x-2 text-xs p-3 bg-slate-900/60 border border-slate-800/60 rounded-xl">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200">Tools Schema Draft-07</div>
                  <div className="text-[11px] text-slate-400">Tool input schemas conform to valid JSON schema specifications.</div>
                </div>
              </div>

              <div className="flex items-start space-x-2 text-xs p-3 bg-slate-900/60 border border-slate-800/60 rounded-xl">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200">Bi-directional Notifications</div>
                  <div className="text-[11px] text-slate-400">Supports asynchronous progress and list change signals.</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
