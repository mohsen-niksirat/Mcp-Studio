import React, { useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Trash2,
  Copy,
  Check,
  Clock,
  AlertCircle,
  Pause,
  Play,
  Filter
} from 'lucide-react';
import { JsonRpcMessageLog } from '../../types';
import { api } from '../../lib/api';

interface TrafficViewProps {
  logs: JsonRpcMessageLog[];
  onClear: () => void;
}

export const TrafficView: React.FC<TrafficViewProps> = ({ logs, onClear }) => {
  const [selectedLog, setSelectedLog] = useState<JsonRpcMessageLog | null>(logs[logs.length - 1] || null);
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [errorOnly, setErrorOnly] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  // Update selected if logs change and not paused
  React.useEffect(() => {
    if (!selectedLog && logs.length > 0) {
      setSelectedLog(logs[logs.length - 1]);
    }
  }, [logs, selectedLog]);

  const filteredLogs = logs.filter((l) => {
    if (directionFilter !== 'all' && l.direction !== directionFilter) return false;
    if (errorOnly && !l.isError) return false;
    if (!search) return true;
    const matchMethod = l.method?.toLowerCase().includes(search.toLowerCase());
    const matchData = JSON.stringify(l.data).toLowerCase().includes(search.toLowerCase());
    return matchMethod || matchData;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Column: Live Traffic Log Feed */}
      <div className="w-[450px] border-r border-slate-800 bg-[#0c1222] flex flex-col shrink-0">
        {/* Controls Bar */}
        <div className="p-3 border-b border-slate-800 space-y-2">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter traffic..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? 'Resume stream' : 'Pause stream'}
              className={`p-2 rounded-xl border text-xs font-medium transition-colors ${
                isPaused
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>

            <button
              onClick={onClear}
              title="Clear all logs"
              className="p-2 bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 rounded-xl transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => setDirectionFilter('all')}
                className={`px-2 py-0.5 rounded font-medium ${
                  directionFilter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setDirectionFilter('outgoing')}
                className={`px-2 py-0.5 rounded font-medium ${
                  directionFilter === 'outgoing'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Req
              </button>
              <button
                onClick={() => setDirectionFilter('incoming')}
                className={`px-2 py-0.5 rounded font-medium ${
                  directionFilter === 'incoming'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Res
              </button>
            </div>

            <label className="flex items-center space-x-1.5 cursor-pointer text-slate-400 hover:text-slate-200">
              <input
                type="checkbox"
                checked={errorOnly}
                onChange={(e) => setErrorOnly(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-0"
              />
              <span className="text-[11px]">Errors only</span>
            </label>
          </div>
        </div>

        {/* Timeline Log List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 font-mono">
              No JSON-RPC traffic recorded yet.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isSelected = selectedLog?.id === log.id;
              const isIncoming = log.direction === 'incoming';

              return (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-indigo-600/15 border-indigo-500/40 text-indigo-200'
                      : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 truncate">
                      {isIncoming ? (
                        <div className="p-1 rounded bg-emerald-500/10 text-emerald-400">
                          <ArrowDownLeft className="h-3 w-3" />
                        </div>
                      ) : (
                        <div className="p-1 rounded bg-indigo-500/10 text-indigo-400">
                          <ArrowUpRight className="h-3 w-3" />
                        </div>
                      )}
                      <span className="font-mono text-xs font-semibold text-slate-200 truncate">
                        {log.method || (isIncoming ? 'Result' : 'RPC')}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 text-[10px] font-mono">
                      {log.latencyMs !== undefined && (
                        <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          {log.latencyMs}ms
                        </span>
                      )}
                      {log.isError && (
                        <span className="text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded font-bold">
                          ERR
                        </span>
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

      {/* Right Column: Inspect JSON-RPC Message */}
      <div className="flex-1 flex flex-col bg-[#0b0f19] overflow-hidden">
        {selectedLog ? (
          <>
            <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-mono font-semibold text-slate-200">
                  {selectedLog.direction === 'outgoing' ? 'Request Payload' : 'Response Payload'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                  {selectedLog.method || 'jsonrpc'}
                </span>
                {selectedLog.latencyMs !== undefined && (
                  <span className="text-xs font-mono text-emerald-400 flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>{selectedLog.latencyMs}ms</span>
                  </span>
                )}
              </div>

              <button
                onClick={() => copyToClipboard(JSON.stringify(selectedLog.data, null, 2))}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors flex items-center space-x-1 text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>Copy JSON</span>
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
              <pre className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-xs font-mono text-indigo-200 overflow-x-auto leading-relaxed selection:bg-indigo-500/30">
                {JSON.stringify(selectedLog.data, null, 2)}
              </pre>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
            <Activity className="h-8 w-8 text-slate-700" />
            <p className="text-xs">Select a JSON-RPC message on the left to inspect its contents.</p>
          </div>
        )}
      </div>
    </div>
  );
};
