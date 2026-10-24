import React, { useState } from 'react';
import {
  Sparkles,
  Search,
  MessageSquare,
  ArrowRight,
  Clock,
  Copy,
  Check,
  Bot,
  User,
  Shield
} from 'lucide-react';
import { PromptItem } from '../../types';
import { api } from '../../lib/api';

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
      <div className="flex-1 flex items-center justify-center p-8 text-slate-500 font-mono text-xs">
        Loading prompts from active MCP server...
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
      {/* Left Column: Prompts List */}
      <div className="w-80 border-r border-slate-800 bg-[#0c1222] flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search prompts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
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
                className={`w-full text-left p-2.5 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-indigo-600/15 border border-indigo-500/30 text-indigo-200'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Sparkles className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className="font-mono text-xs font-semibold truncate">{p.name}</span>
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

      {/* Middle & Right: Parameters & Generated Messages */}
      {selectedPrompt && (
        <div className="flex-1 flex overflow-hidden">
          {/* Middle: Parameter Editor */}
          <div className="w-96 border-r border-slate-800 p-6 overflow-y-auto bg-[#0a0f1d] shrink-0 space-y-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm font-bold text-slate-100">
                  {selectedPrompt.name}
                </span>
                <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                  prompt
                </span>
              </div>
              {selectedPrompt.description && (
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {selectedPrompt.description}
                </p>
              )}
            </div>

            <div className="space-y-3 pt-2">
              <div className="text-xs font-semibold text-slate-300">Prompt Arguments</div>

              {!selectedPrompt.arguments || selectedPrompt.arguments.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                  No arguments required for this prompt.
                </div>
              ) : (
                selectedPrompt.arguments.map((arg) => (
                  <div key={arg.name} className="space-y-1">
                    <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                      <span className="font-mono text-indigo-300">{arg.name}</span>
                      {arg.required && <span className="text-rose-400 text-[10px]">Required</span>}
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
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={argValues[arg.name] || ''}
                        onChange={(e) =>
                          setArgValues({ ...argValues, [arg.name]: e.target.value })
                        }
                        placeholder={`Enter ${arg.name}...`}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                ))
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all flex items-center justify-center space-x-2"
              >
                <span>{isGenerating ? 'Rendering...' : 'Get Prompt (prompts/get)'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Right: Rendered Messages */}
          <div className="flex-1 flex flex-col bg-[#0b0f19] overflow-hidden">
            <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-semibold text-slate-300">Generated Messages</span>
                {latency !== null && (
                  <div className="flex items-center space-x-1 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                    <Clock className="h-3 w-3" />
                    <span>{latency}ms</span>
                  </div>
                )}
              </div>

              {result && (
                <button
                  onClick={() => copyToClipboard(JSON.stringify(result.messages, null, 2))}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors flex items-center space-x-1 text-xs"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>Copy Messages</span>
                </button>
              )}
            </div>

            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-500">
                  <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-mono">Generating prompt template...</span>
                </div>
              ) : error ? (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-mono text-rose-300">
                  {error}
                </div>
              ) : result?.messages ? (
                <div className="space-y-4">
                  {result.messages.map((m: any, idx: number) => {
                    const isSystem = m.role === 'system';
                    const isUser = m.role === 'user';
                    return (
                      <div
                        key={idx}
                        className={`rounded-2xl p-4 border space-y-2 ${
                          isSystem
                            ? 'bg-purple-950/20 border-purple-500/30'
                            : isUser
                            ? 'bg-indigo-950/20 border-indigo-500/30'
                            : 'bg-emerald-950/20 border-emerald-500/30'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {isSystem ? (
                            <Shield className="h-4 w-4 text-purple-400" />
                          ) : isUser ? (
                            <User className="h-4 w-4 text-indigo-400" />
                          ) : (
                            <Bot className="h-4 w-4 text-emerald-400" />
                          )}
                          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
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
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                  <MessageSquare className="h-8 w-8 text-slate-700" />
                  <p className="text-xs">
                    Configure prompt parameters on the left and click <span className="text-indigo-400 font-semibold">Get Prompt</span>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
