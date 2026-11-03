import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Check,
  Play,
  RotateCcw,
  Search,
  Wrench
} from 'lucide-react';
import { ToolItem, ServerState } from '../../types';
import { DynamicSchemaForm } from './DynamicSchemaForm';
import { CodeSnippetModal } from './CodeSnippetModal';
import { api } from '../../lib/api';
import { Badge, Button, Card, CardBody, EmptyState, Spinner } from '../ui/primitives';
import { cn } from '../../lib/cn';

interface ToolsViewProps {
  tools: ToolItem[];
  isLoading: boolean;
  activeState?: ServerState | null;
  pendingSelectTool?: string | null;
  onPendingToolConsumed?: () => void;
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

export const ToolsView: React.FC<ToolsViewProps> = ({
  tools,
  isLoading,
  activeState,
  pendingSelectTool,
  onPendingToolConsumed
}) => {
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
  const [isSnippetOpen, setIsSnippetOpen] = useState(false);
  const executeSeqRef = React.useRef(0);

  // Keep selected tool in sync with the live catalog: drop the selection if
  // the tool disappears (server switch / disconnect) and pick the first tool
  // when nothing valid is selected.
  React.useEffect(() => {
    if (tools.length === 0) {
      executeSeqRef.current += 1;
      setSelectedTool(null);
      return;
    }
    if (!selectedTool || !tools.some((t) => t.name === selectedTool.name)) {
      executeSeqRef.current += 1;
      setSelectedTool(tools[0]);
    }
  }, [tools, selectedTool]);

  const filteredTools = tools.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectTool = (t: ToolItem) => {
    executeSeqRef.current += 1;
    setSelectedTool(t);
    setFormValues({});
    setLastResult(null);
    setLastError(null);
    setLastLatency(null);
  };

  // A tool picked from the command palette (or another view) lands here.
  React.useEffect(() => {
    if (!pendingSelectTool) return;
    const match = tools.find((t) => t.name === pendingSelectTool);
    if (match) handleSelectTool(match);
    onPendingToolConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSelectTool]);

  const handleExecute = async () => {
    if (!selectedTool) return;
    const requestId = ++executeSeqRef.current;
    setIsExecuting(true);
    setLastError(null);
    const start = Date.now();

    try {
      const res = await api.callTool(selectedTool.name, formValues);
      if (executeSeqRef.current !== requestId) return;
      const latency =
        res.latencyMs !== undefined ? res.latencyMs : Date.now() - start;
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
      if (executeSeqRef.current !== requestId) return;
      setLastError(err.message || 'Execution failed');
      setLastLatency(Date.now() - start);
    } finally {
      if (executeSeqRef.current === requestId) {
        setIsExecuting(false);
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Spinner />
          <span className="text-xs font-mono">Loading tools...</span>
        </div>
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="No tools discovered"
        description="Connect to an active server or pick the built-in demo server from the header to start executing tools."
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
      {/* Tool list */}
      <div className="w-full lg:w-72 max-h-56 lg:max-h-none border-b lg:border-b-0 lg:border-r border-surface-800 bg-surface-950 flex flex-col shrink-0">
        <div className="p-3 border-b border-surface-800">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tools..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tools"
              className="w-full bg-surface-900 border border-surface-800 rounded-md pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
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
                aria-current={isSelected ? 'true' : undefined}
                className={cn(
                  'w-full text-left p-2.5 rounded-lg transition-colors',
                  isSelected
                    ? 'bg-brand-600/15 text-brand-200'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-900/60'
                )}
              >
                <div className="flex items-center gap-2">
                  <Wrench
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      isSelected ? 'text-brand-400' : 'text-slate-400'
                    )}
                  />
                  <span className="font-mono text-xs font-semibold truncate">
                    {t.name}
                  </span>
                </div>
                {t.description && (
                  <p className="text-[11px] text-slate-400 truncate mt-1 pl-5">
                    {t.description}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedTool && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Schema form */}
          <div className="w-full lg:w-96 border-b lg:border-b-0 lg:border-r border-surface-800 p-4 lg:p-5 overflow-y-auto bg-surface-950 shrink-0">
            <div className="mb-5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-sm font-bold text-slate-100 truncate">
                    {selectedTool.name}
                  </span>
                  <Badge tone="brand" className="font-mono text-[10px]">
                    tool
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsSnippetOpen(true)}
                  title="Generate integration code"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  <span>Snippet</span>
                </Button>
              </div>
              {selectedTool.description && (
                <p className="text-xs text-slate-400 leading-relaxed">
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

            <CodeSnippetModal
              isOpen={isSnippetOpen}
              onClose={() => setIsSnippetOpen(false)}
              tool={selectedTool}
              args={formValues}
              activeState={activeState}
            />
          </div>

          {/* Output */}
          <div className="flex-1 flex flex-col bg-surface-950 overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-800 flex items-center justify-between gap-3 bg-surface-900/40">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-slate-300">
                  Execution Output
                </span>
                {lastLatency !== null && (
                  <Badge tone="success" className="font-mono text-[11px]">
                    <Clock className="h-3 w-3" />
                    {lastLatency}ms
                  </Badge>
                )}
                {lastError && (
                  <Badge tone="danger" className="font-mono text-[11px]">
                    <AlertCircle className="h-3 w-3" />
                    Error
                  </Badge>
                )}
                {lastResult && !lastError && (
                  <Badge tone="success" className="font-mono text-[11px]">
                    <CheckCircle2 className="h-3 w-3" />
                    Success
                  </Badge>
                )}
              </div>

              {lastResult && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-surface-900 border border-surface-800 rounded-md p-0.5 gap-0.5">
                    {(['formatted', 'structured', 'raw'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveResultTab(tab)}
                        className={cn(
                          'px-2 py-0.5 text-[11px] font-medium rounded transition-colors capitalize',
                          activeResultTab === tab
                            ? 'bg-surface-800 text-slate-200'
                            : 'text-slate-400 hover:text-slate-200'
                        )}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(JSON.stringify(lastResult, null, 2))
                    }
                    title="Copy result"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex-1 p-5 overflow-y-auto">
              {isExecuting ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Spinner />
                  <span className="text-xs font-mono">
                    Calling {selectedTool.name}...
                  </span>
                </div>
              ) : lastError ? (
                <Card className="border-rose-500/25 bg-rose-950/10">
                  <CardBody>
                    <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold mb-2">
                      <AlertCircle className="h-4 w-4" />
                      <span>Tool Execution Failed</span>
                    </div>
                    <pre className="text-xs font-mono text-rose-300 whitespace-pre-wrap leading-relaxed">
                      {lastError}
                    </pre>
                  </CardBody>
                </Card>
              ) : lastResult ? (
                <div>
                  {activeResultTab === 'formatted' ? (
                    <div className="space-y-3">
                      {lastResult.content?.map((c: any, idx: number) => (
                        <div
                          key={idx}
                          className="bg-surface-900/60 border border-surface-800 rounded-lg p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed"
                        >
                          {c.text}
                        </div>
                      ))}
                    </div>
                  ) : activeResultTab === 'structured' ? (
                    <pre className="code-block">
                      {JSON.stringify(lastResult.structuredData, null, 2)}
                    </pre>
                  ) : (
                    <pre className="code-block">
                      {JSON.stringify(lastResult, null, 2)}
                    </pre>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={Play}
                  title="Ready to execute"
                  description="Fill the parameters on the left and click Run Tool."
                />
              )}
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="border-t border-surface-800 bg-surface-950 p-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-medium flex items-center gap-1.5">
                    <RotateCcw className="h-3 w-3 text-brand-400" />
                    <span>Recent Runs</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {history.length} runs
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setFormValues(item.args);
                        setLastResult(item.result);
                        setLastLatency(item.latencyMs);
                        setLastError(item.error || null);
                      }}
                      className="px-2.5 py-1.5 bg-surface-900 hover:bg-surface-800 border border-surface-800 rounded-lg text-left shrink-0 transition-colors"
                    >
                      <div className="font-mono text-[11px] text-brand-300">
                        {item.toolName}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <span>{item.latencyMs}ms</span>
                        <span>·</span>
                        <span>
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </span>
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
