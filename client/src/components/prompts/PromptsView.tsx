import React, { useState } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  Clock,
  Copy,
  MessageSquare,
  Search,
  Shield,
  Sparkles,
  User
} from 'lucide-react';
import { PromptItem } from '../../types';
import { api } from '../../lib/api';
import { Badge, Button, Card, CardBody, EmptyState, Spinner } from '../ui/primitives';
import { cn } from '../../lib/cn';

interface PromptsViewProps {
  prompts: PromptItem[];
  isLoading: boolean;
}

export const PromptsView: React.FC<PromptsViewProps> = ({ prompts, isLoading }) => {
  const [selectedPrompt, setSelectedPrompt] = useState<PromptItem | null>(prompts[0] || null);
  const [search, setSearch] = useState('');
  const [argValues, setArgValues] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (!selectedPrompt && prompts.length > 0) {
      handleSelectPrompt(prompts[0]);
    }
  }, [prompts, selectedPrompt]);

  const handleSelectPrompt = (p: PromptItem) => {
    setSelectedPrompt(p);
    const initialArgs: Record<string, string> = {};
    p.arguments?.forEach((a) => {
      if (a.name === 'code') initialArgs[a.name] = 'function sum(a, b) {\n  return a + b;\n}';
      else if (a.name === 'language') initialArgs[a.name] = 'javascript';
      else if (a.name === 'requirement') initialArgs[a.name] = 'Find all users who joined in the last 30 days';
      else initialArgs[a.name] = '';
    });
    setArgValues(initialArgs);
    setResult(null);
    setError(null);
    setLatency(null);
  };

  const handleGenerate = async () => {
    if (!selectedPrompt) return;
    setIsGenerating(true);
    setError(null);
    const start = Date.now();

    try {
      const data = await api.getPrompt(selectedPrompt.name, argValues);
      setResult(data);
      setLatency(data.latencyMs || Date.now() - start);
    } catch (e: any) {
      setError(e.message || 'Failed to render prompt');
      setResult(null);
    } finally {
      setIsGenerating(false);
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
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Spinner />
          <span className="text-xs font-mono">Loading prompts...</span>
        </div>
      </div>
    );
  }

  const filteredPrompts = prompts.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Prompt list */}
      <div className="w-72 border-r border-surface-800 bg-surface-950 flex flex-col shrink-0">
        <div className="p-3 border-b border-surface-800">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search prompts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-900 border border-surface-800 rounded-md pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredPrompts.map((p) => {
            const isSelected = selectedPrompt?.name === p.name;
            return (
              <button
                key={p.name}
                onClick={() => handleSelectPrompt(p)}
                className={cn(
                  'w-full text-left p-2.5 rounded-lg transition-colors',
                  isSelected
                    ? 'bg-brand-600/15 text-brand-200'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-900/60'
                )}
              >
                <div className="flex items-center gap-2">
                  <Sparkles
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      isSelected ? 'text-brand-400' : 'text-slate-500'
                    )}
                  />
                  <span className="font-mono text-xs font-semibold truncate">
                    {p.name}
                  </span>
                </div>
                {p.description && (
                  <p className="text-[11px] text-slate-500 truncate mt-1 pl-5">
                    {p.description}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedPrompt && (
        <div className="flex-1 flex overflow-hidden">
          {/* Arguments */}
          <div className="w-96 border-r border-surface-800 p-5 overflow-y-auto bg-surface-950 shrink-0 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-slate-100 truncate">
                  {selectedPrompt.name}
                </span>
                <Badge tone="brand" className="font-mono text-[10px]">
                  prompt
                </Badge>
              </div>
              {selectedPrompt.description && (
                <p className="text-xs text-slate-500 leading-relaxed">
                  {selectedPrompt.description}
                </p>
              )}
            </div>

            <div className="space-y-3 pt-1">
              <div className="section-label">Arguments</div>

              {!selectedPrompt.arguments || selectedPrompt.arguments.length === 0 ? (
                <div className="text-xs text-slate-500 bg-surface-900/40 p-3 rounded-lg border border-surface-800">
                  No arguments required for this prompt.
                </div>
              ) : (
                selectedPrompt.arguments.map((arg) => (
                  <div key={arg.name} className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                      <span className="font-mono text-brand-300">{arg.name}</span>
                      {arg.required && (
                        <span className="text-rose-400 text-[10px] font-medium">
                          Required
                        </span>
                      )}
                    </label>
                    {arg.description && (
                      <p className="text-[11px] text-slate-500">{arg.description}</p>
                    )}
                    {arg.name === 'code' ? (
                      <textarea
                        rows={4}
                        value={argValues[arg.name] || ''}
                        onChange={(e) =>
                          setArgValues({ ...argValues, [arg.name]: e.target.value })
                        }
                        className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60 resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={argValues[arg.name] || ''}
                        onChange={(e) =>
                          setArgValues({ ...argValues, [arg.name]: e.target.value })
                        }
                        placeholder={`Enter ${arg.name}...`}
                        className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                      />
                    )}
                  </div>
                ))
              )}

              <Button
                variant="primary"
                size="lg"
                className="w-full justify-center"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                <span>{isGenerating ? 'Rendering...' : 'Get Prompt'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Rendered messages */}
          <div className="flex-1 flex flex-col bg-surface-950 overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-800 flex items-center justify-between bg-surface-900/40">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  Generated Messages
                </span>
                {latency !== null && (
                  <Badge tone="success" className="font-mono text-[11px]">
                    <Clock className="h-3 w-3" />
                    {latency}ms
                  </Badge>
                )}
              </div>

              {result && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(JSON.stringify(result.messages, null, 2))
                  }
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>Copy</span>
                </Button>
              )}
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-500">
                  <Spinner />
                  <span className="text-xs font-mono">Generating prompt...</span>
                </div>
              ) : error ? (
                <Card className="border-rose-500/25 bg-rose-950/10">
                  <CardBody>
                    <pre className="text-xs font-mono text-rose-300 whitespace-pre-wrap">
                      {error}
                    </pre>
                  </CardBody>
                </Card>
              ) : result?.messages ? (
                <div className="space-y-3">
                  {result.messages.map((m: any, idx: number) => {
                    const isSystem = m.role === 'system';
                    const isUser = m.role === 'user';
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'rounded-lg p-4 border space-y-2',
                          isSystem
                            ? 'bg-purple-950/15 border-purple-500/25'
                            : isUser
                            ? 'bg-brand-950/20 border-brand-500/25'
                            : 'bg-emerald-950/15 border-emerald-500/25'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {isSystem ? (
                            <Shield className="h-4 w-4 text-purple-400" />
                          ) : isUser ? (
                            <User className="h-4 w-4 text-brand-400" />
                          ) : (
                            <Bot className="h-4 w-4 text-emerald-400" />
                          )}
                          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-300">
                            {m.role}
                          </span>
                        </div>
                        <div className="text-xs text-slate-200 whitespace-pre-wrap font-mono leading-relaxed pl-6">
                          {typeof m.content === 'string'
                            ? m.content
                            : m.content?.text || JSON.stringify(m.content, null, 2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={MessageSquare}
                  title="No prompt rendered yet"
                  description="Configure the arguments on the left and click Get Prompt to preview the conversation."
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
