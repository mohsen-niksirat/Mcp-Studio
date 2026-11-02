import React, { useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Pause,
  Play,
  Search,
  Trash2
} from 'lucide-react';
import { JsonRpcMessageLog } from '../../types';
import { api } from '../../lib/api';
import { Badge, Button, EmptyState } from '../ui/primitives';
import { cn } from '../../lib/cn';

interface TrafficViewProps {
  logs: JsonRpcMessageLog[];
  onClear: () => void;
  /** Identity of the active server; changing it invalidates the history backfill. */
  activeServerId?: string;
}

/** Max rows rendered at once — beyond this the list is windowed. */
const RENDER_WINDOW = 200;

export const TrafficView: React.FC<TrafficViewProps> = ({ logs, onClear, activeServerId }) => {
  const [selectedLog, setSelectedLog] = useState<JsonRpcMessageLog | null>(
    logs[logs.length - 1] || null
  );
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [errorOnly, setErrorOnly] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Older frames fetched once from /api/logs; live appends come via WebSocket. */
  const [historicalLogs, setHistoricalLogs] = useState<JsonRpcMessageLog[] | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  /** How many frames the server-side query should return. */
  const [logLimit, setLogLimit] = useState(500);

  // Follow the newest frame unless the user pinned a selection or paused.
  React.useEffect(() => {
    if (!isPaused && logs.length > 0) {
      const last = logs[logs.length - 1];
      if (!selectedLog || last.id !== selectedLog.id) {
        if (!selectedLog) setSelectedLog(last);
      }
    }
  }, [logs, isPaused, selectedLog]);

  // Debounce the text filter so typing does not re-filter the whole buffer
  // on every keystroke.
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => window.clearTimeout(t);
  }, [search]);

  // Backfill older history from the server once (and when the limit or the
  // active server changes). Live appends arrive through the WebSocket 'log'
  // events in the logs prop; filtering happens in-memory, so incoming frames
  // never trigger refetches.
  React.useEffect(() => {
    if (api.isWebStandalone()) {
      setHistoricalLogs(null);
      return;
    }
    let cancelled = false;
    setHistoricalLogs(null);
    setIsFetching(true);
    api
      .getLogs(logLimit)
      .then((fetched) => {
        if (!cancelled) setHistoricalLogs(fetched);
      })
      .catch(() => {
        if (!cancelled) setHistoricalLogs(null);
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logLimit, activeServerId]);

  const baseLogs = React.useMemo(() => {
    if (!historicalLogs || historicalLogs.length === 0) return logs;
    const liveIds = new Set(logs.map((l) => l.id));
    const older = historicalLogs.filter((l) => !liveIds.has(l.id));
    return [...older, ...logs];
  }, [historicalLogs, logs]);

  const filteredLogs = baseLogs.filter((l) => {
    if (directionFilter !== 'all' && l.direction !== directionFilter) return false;
    if (errorOnly && !l.isError) return false;
    if (!debouncedSearch) return true;
    const needle = debouncedSearch.toLowerCase();
    const matchMethod = l.method?.toLowerCase().includes(needle);
    const matchData = JSON.stringify(l.data).toLowerCase().includes(needle);
    return matchMethod || matchData;
  });

  // Windowing: render at most the newest RENDER_WINDOW rows; older frames
  // stay available through the server query.
  const visibleLogs = filteredLogs.slice(-RENDER_WINDOW);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setHistoricalLogs(null);
    onClear();
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Live feed */}
      <div className="w-[420px] border-r border-surface-800 bg-surface-950 flex flex-col shrink-0">
        <div className="p-3 border-b border-surface-800 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter traffic..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-surface-900 border border-surface-800 rounded-md pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
              />
            </div>

            <Button
              variant={isPaused ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? 'Resume stream' : 'Pause stream'}
              className={cn(isPaused && 'text-amber-300 border-amber-500/30')}
            >
              {isPaused ? (
                <Play className="h-3.5 w-3.5" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
            </Button>

            <Button variant="ghost" size="icon" onClick={handleClear} title="Clear logs">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-surface-900 border border-surface-800 rounded-md p-0.5 gap-0.5">
                {(['all', 'outgoing', 'incoming'] as const).map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setDirectionFilter(dir)}
                    className={cn(
                      'px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors capitalize',
                      directionFilter === dir
                        ? 'bg-surface-800 text-slate-200'
                        : 'text-slate-400 hover:text-slate-200'
                    )}
                  >
                    {dir === 'all' ? 'All' : dir === 'outgoing' ? 'Req' : 'Res'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 bg-surface-900 border border-surface-800 rounded-md px-2 py-1 text-[11px] text-slate-400">
                <span>Last</span>
                <select
                  value={logLimit}
                  onChange={(e) => setLogLimit(Number(e.target.value))}
                  aria-label="Number of log frames to fetch"
                  className="bg-transparent text-brand-300 font-mono focus:outline-none cursor-pointer"
                >
                  <option value={100} className="bg-surface-900">100</option>
                  <option value={200} className="bg-surface-900">200</option>
                  <option value={500} className="bg-surface-900">500</option>
                  <option value={1000} className="bg-surface-900">1000</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200">
              <input
                type="checkbox"
                checked={errorOnly}
                onChange={(e) => setErrorOnly(e.target.checked)}
                className="rounded bg-surface-900 border-surface-700 text-rose-500 focus:ring-brand-500/40 focus:ring-offset-0"
              />
              <span className="text-[11px]">Errors only</span>
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {visibleLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 font-mono">
              No JSON-RPC traffic recorded yet.
            </div>
          ) : (
            visibleLogs.map((log) => {
              const isSelected = selectedLog?.id === log.id;
              const isIncoming = log.direction === 'incoming';

              return (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={cn(
                    'w-full text-left p-2.5 rounded-lg border transition-colors',
                    isSelected
                      ? 'bg-brand-600/15 border-brand-500/30 text-brand-200'
                      : 'bg-surface-900/40 border-surface-800/80 hover:border-surface-700 text-slate-400'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      {isIncoming ? (
                        <div className="p-1 rounded bg-emerald-600/10 text-emerald-400">
                          <ArrowDownLeft className="h-3 w-3" />
                        </div>
                      ) : (
                        <div className="p-1 rounded bg-brand-600/10 text-brand-400">
                          <ArrowUpRight className="h-3 w-3" />
                        </div>
                      )}
                      <span className="font-mono text-xs font-medium text-slate-200 truncate">
                        {log.method || (isIncoming ? 'Result' : 'RPC')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono">
                      {log.latencyMs !== undefined && (
                        <span className="text-emerald-400">{log.latencyMs}ms</span>
                      )}
                      {log.isError && (
                        <span className="text-rose-400 font-bold">ERR</span>
                      )}
                      <span className="text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 truncate mt-1.5">
                    {JSON.stringify(log.data)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Inspector */}
      <div className="flex-1 flex flex-col bg-surface-950 overflow-hidden">
        {selectedLog ? (
          <>
            <div className="px-5 py-3 border-b border-surface-800 flex items-center justify-between bg-surface-900/40">
              <div className="flex items-center gap-2">
                <Badge
                  tone={selectedLog.direction === 'outgoing' ? 'brand' : 'success'}
                  className="font-mono text-[10px]"
                >
                  {selectedLog.direction === 'outgoing' ? 'Request' : 'Response'}
                </Badge>
                <span className="text-xs font-mono text-slate-300">
                  {selectedLog.method || 'jsonrpc'}
                </span>
                {selectedLog.latencyMs !== undefined && (
                  <Badge tone="success" className="font-mono text-[11px]">
                    <Clock className="h-3 w-3" />
                    {selectedLog.latencyMs}ms
                  </Badge>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(JSON.stringify(selectedLog.data, null, 2))}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>Copy JSON</span>
              </Button>
            </div>

            <div className="flex-1 p-5 overflow-y-auto">
              <pre className="code-block leading-relaxed">
                {JSON.stringify(selectedLog.data, null, 2)}
              </pre>
            </div>
          </>
        ) : (
          <EmptyState
            icon={Activity}
            title="No message selected"
            description="Select a JSON-RPC frame on the left to inspect its full payload."
          />
        )}
      </div>
    </div>
  );
};
