import React, { useState } from 'react';
import {
  Wrench,
  Search,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Code2,
  FileText,
  RotateCcw
} from 'lucide-react';
import { ToolItem } from '../../types';
import { DynamicSchemaForm } from './DynamicSchemaForm';
import { api } from '../../lib/api';

interface ToolsViewProps {
  tools: ToolItem[];
  isLoading: boolean;
}

interface ExecutionHistoryItem {
  id: string;
  toolName: string;
  args: Record<string, any>;
  result: any;
  error?: string;
  latencyMs: number;
  timestamp: number;
}

export const ToolsView: React.FC<ToolsViewProps> = ({ tools, isLoading }) => {
  const [selectedTool, setSelectedTool] = useState<ToolItem | null>(tools[0] || null);
  const [search, setSearch] = useState('');
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState<'formatted' | 'structured' | 'raw'>('formatted');
  const [history, setHistory] = useState<ExecutionHistoryItem[]>([]);

  // Update selected tool if tools change
  React.useEffect(() => {
    if (!selectedTool && tools.length > 0) {
      setSelectedTool(tools[0]);
    }
  }, [tools, selectedTool]);

  const filteredTools = tools.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectTool = (t: ToolItem) => {
    setSelectedTool(t);
    setFormValues({});
    setLastResult(null);
    setLastError(null);
    setLastLatency(null);
  };

  const handleExecute = async () => {
    if (!selectedTool) return;
    setIsExecuting(true);
    setLastError(null);
    const start = Date.now();

    try {
      const res = await api.callTool(selectedTool.name, formValues);
      const latency = res.latencyMs !== undefined ? res.latencyMs : Date.now() - start;
      setLastResult(res);
      setLastLatency(latency);

      const historyItem: ExecutionHistoryItem = {
        id: `hist-${Date.now()}`,
        toolName: selectedTool.name,
        args: { ...formValues },
        result: res,
        latencyMs: latency,
        timestamp: Date.now()
      };
      setHistory((prev) => [historyItem, ...prev.slice(0, 19)]);
    } catch (err: any) {
      const latency = Date.now() - start;
      setLastError(err.message || 'Execution failed');
      setLastLatency(latency);
    } finally {
      setIsExecuting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-500 font-mono text-xs">
        Loading tools from active MCP server...
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-500">
          <Wrench className="h-8 w-8 text-indigo-400 mx-auto" />
        </div>
        <h3 className="text-sm font-semibold text-slate-300">No tools discovered</h3>
        <p className="text-xs text-slate-500 max-w-sm">
          Connect to an active server or select the built-in MCP-Studio Demo Server in the top header.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Column: Tool List */}
      <div className="w-80 border-r border-slate-800 bg-[#0c1222] flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tools..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredTools.map((t) => {
            const isSelected = selectedTool?.name === t.name;
            return (
              <button
                key={t.name}
                onClick={() => handleSelectTool(t)}
                className={`w-full text-left p-2.5 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-indigo-600/15 border border-indigo-500/30 text-indigo-200'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Wrench className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className="font-mono text-xs font-semibold truncate">{t.name}</span>
                </div>
                {t.description && (
                  <p className="text-[11px] text-slate-500 truncate mt-1 pl-5">
                    {t.description}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Center & Right: Runner and Results */}
      {selectedTool && (
        <div className="flex-1 flex overflow-hidden">
          {/* Middle: Schema Form */}
          <div className="w-96 border-r border-slate-800 p-6 overflow-y-auto bg-[#0a0f1d] shrink-0">
            <div className="mb-4">
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm font-bold text-slate-100">
                  {selectedTool.name}
                </span>
                <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                  tool
                </span>
              </div>
              {selectedTool.description && (
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {selectedTool.description}
                </p>
              )}
            </div>

            <DynamicSchemaForm
              schema={selectedTool.inputSchema}
              values={formValues}
              onChange={setFormValues}
              onSubmit={handleExecute}
              isLoading={isExecuting}
            />
          </div>

          {/* Right: Response Output & History */}
          <div className="flex-1 flex flex-col bg-[#0b0f19] overflow-hidden">
            {/* Header: Latency & Response Controls */}
            <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-semibold text-slate-300">Execution Output</span>
                {lastLatency !== null && (
                  <div className="flex items-center space-x-1.5 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                    <Clock className="h-3 w-3" />
                    <span>{lastLatency}ms</span>
                  </div>
                )}
                {lastError && (
                  <div className="flex items-center space-x-1 text-xs font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                    <AlertCircle className="h-3 w-3" />
                    <span>Error</span>
                  </div>
                )}
                {lastResult && !lastError && (
                  <div className="flex items-center space-x-1 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Success</span>
                  </div>
                )}
              </div>

              {lastResult && (
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs">
                    <button
                      onClick={() => setActiveResultTab('formatted')}
                      className={`px-2 py-0.5 rounded font-medium ${
                        activeResultTab === 'formatted'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Formatted
                    </button>
                    {lastResult.structuredData && (
                      <button
                        onClick={() => setActiveResultTab('structured')}
                        className={`px-2 py-0.5 rounded font-medium ${
                          activeResultTab === 'structured'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Structured
                      </button>
                    )}
                    <button
                      onClick={() => setActiveResultTab('raw')}
                      className={`px-2 py-0.5 rounded font-medium ${
                        activeResultTab === 'raw'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Raw JSON
                    </button>
                  </div>

                  <button
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(lastResult, null, 2)
                      )
                    }
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Copy Result"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Output Body */}
            <div className="flex-1 p-6 overflow-y-auto">
              {isExecuting ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-500">
                  <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-mono">Calling {selectedTool.name}...</span>
                </div>
              ) : lastError ? (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-rose-400 text-xs font-semibold">
                    <AlertCircle className="h-4 w-4" />
                    <span>Tool Execution Failed</span>
                  </div>
                  <pre className="text-xs font-mono text-rose-300 whitespace-pre-wrap">
                    {lastError}
                  </pre>
                </div>
              ) : lastResult ? (
                <div>
                  {activeResultTab === 'formatted' ? (
                    <div className="space-y-4">
                      {lastResult.content?.map((c: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed selection:bg-indigo-500/30"
                        >
                          {c.text}
                        </div>
                      ))}
                    </div>
                  ) : activeResultTab === 'structured' ? (
                    <pre className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-xs font-mono text-indigo-300 overflow-x-auto">
                      {JSON.stringify(lastResult.structuredData, null, 2)}
                    </pre>
                  ) : (
                    <pre className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-xs font-mono text-indigo-300 overflow-x-auto">
                      {JSON.stringify(lastResult, null, 2)}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-slate-500">
                  <Play className="h-8 w-8 text-slate-700" />
                  <p className="text-xs">
                    Fill the parameters on the left and click <span className="text-indigo-400 font-semibold">Run Tool</span>.
                  </p>
                </div>
              )}
            </div>

            {/* Run History Drawer (Bottom) */}
            {history.length > 0 && (
              <div className="border-t border-slate-800 bg-slate-950/70 p-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                    <RotateCcw className="h-3 w-3 text-indigo-400" />
                    <span>Recent Tool Executions</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">{history.length} runs</span>
                </div>
                <div className="flex space-x-2 overflow-x-auto pb-1">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setFormValues(item.args);
                        setLastResult(item.result);
                        setLastLatency(item.latencyMs);
                        setLastError(item.error || null);
                      }}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-left shrink-0 transition-colors"
                    >
                      <div className="font-mono text-[11px] text-indigo-300">{item.toolName}</div>
                      <div className="text-[10px] text-slate-500 font-mono flex items-center space-x-1">
                        <span>{item.latencyMs}ms</span>
                        <span>•</span>
                        <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
