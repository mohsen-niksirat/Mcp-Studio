import React, { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Key,
  RefreshCw,
  Send,
  Sliders,
  Trash2,
  Upload,
  User,
  Wrench
} from 'lucide-react';
import { AIProvider, ChatConfig, ChatMessage, ToolItem } from '../../types';
import { ChatSandboxService } from '../../lib/chat-service';
import { Badge, Button } from '../ui/primitives';
import { cn } from '../../lib/cn';

interface ChatSandboxViewProps {
  tools: ToolItem[];
}

const DEFAULT_CHAT_CONFIG: ChatConfig = {
  provider: 'mock' as AIProvider,
  apiKey: '',
  model: 'gemini-2.0-flash',
  endpoint: 'http://localhost:11434/v1',
  temperature: 0.7,
  systemPrompt:
    'You are an autonomous AI assistant powered by MCP-Studio. You have access to real-time tools. Use the provided tools whenever they help answer the user question accurately.'
};

const normalizeImportedMessages = (raw: any): ChatMessage[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m === 'object' && !Array.isArray(m))
    .map((m) => {
      const toolCalls = Array.isArray(m.toolCalls)
        ? m.toolCalls
            .filter((tc: any) => tc && typeof tc === 'object' && typeof tc.name === 'string')
            .map((tc: any) => ({
              ...tc,
              id: typeof tc.id === 'string' && tc.id ? tc.id : crypto.randomUUID(),
              args: tc.args && typeof tc.args === 'object' && !Array.isArray(tc.args) ? tc.args : {}
            }))
        : undefined;
      return {
        id: typeof m.id === 'string' && m.id ? m.id : crypto.randomUUID(),
        role: m.role === 'user' || m.role === 'system' ? m.role : 'assistant',
        content: typeof m.content === 'string' ? m.content : '',
        timestamp:
          typeof m.timestamp === 'number' && Number.isFinite(m.timestamp)
            ? m.timestamp
            : Date.now(),
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {})
      } as ChatMessage;
    });
};

export const ChatSandboxView: React.FC<ChatSandboxViewProps> = ({ tools }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('mcp_studio_chat_history');
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
    } catch {
      return [];
    }
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedCalls, setExpandedCalls] = useState<Record<string, boolean>>({});

  const [config, setConfig] = useState<ChatConfig>(() => {
    try {
      const saved = localStorage.getItem('mcp_studio_chat_config');
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...DEFAULT_CHAT_CONFIG, ...parsed };
      }
    } catch {
      // Corrupted config: fall through to the defaults below.
    }
    return DEFAULT_CHAT_CONFIG;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historySaveTimerRef = useRef<number | null>(null);
  const latestMessagesRef = useRef(messages);

  useEffect(() => {
    localStorage.setItem('mcp_studio_chat_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    latestMessagesRef.current = messages;
    if (historySaveTimerRef.current !== null) {
      window.clearTimeout(historySaveTimerRef.current);
    }
    historySaveTimerRef.current = window.setTimeout(() => {
      historySaveTimerRef.current = null;
      localStorage.setItem('mcp_studio_chat_history', JSON.stringify(messages));
    }, 1000);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (historySaveTimerRef.current !== null) {
        window.clearTimeout(historySaveTimerRef.current);
      }
      localStorage.setItem(
        'mcp_studio_chat_history',
        JSON.stringify(latestMessagesRef.current)
      );
    };
  }, []);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    setInput('');
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsLoading(true);

    try {
      await ChatSandboxService.sendUserMessage(
        text,
        newHistory,
        tools,
        config,
        (partialAssistantMsg) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.id === partialAssistantMsg.id) {
              return [...prev.slice(0, -1), partialAssistantMsg];
            }
            return [...prev, partialAssistantMsg];
          });
        }
      );
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Error: ${err.message || 'Failed to process request.'}`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    localStorage.removeItem('mcp_studio_chat_history');
  };

  const handleExport = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(messages, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', 'mcp-studio-chat-history.json');
    dlAnchor.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = normalizeImportedMessages(JSON.parse(event.target?.result as string));
        if (imported.length === 0) {
          alert('No valid chat messages found in file');
          return;
        }
        setMessages(imported);
      } catch {
        alert('Invalid chat history JSON file');
      }
    };
    reader.readAsText(file);
  };

  const toggleCallExpand = (id: string) => {
    setExpandedCalls((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const providerLabel =
    config.provider === 'mock'
      ? 'Built-in Simulator'
      : config.provider === 'gemini'
      ? `Gemini (${config.model})`
      : config.provider === 'ollama'
      ? `Ollama (${config.model})`
      : `OpenAI (${config.model})`;

  const suggestions = [
    'What are the host CPU specs and available RAM?',
    'Calculate 2 to the power of 16 using math_calculator',
    'Generate 4 mock developer user profiles',
    'Prettify this JSON: {"id":1,"status":"ok","count":42}'
  ];

  return (
    <div className="flex-1 flex flex-col bg-surface-950 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-surface-800 bg-surface-900/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-600/15 border border-brand-500/25 flex items-center justify-center">
            <Bot className="h-4 w-4 text-brand-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">
                AI Chat Sandbox
              </span>
              <Badge tone="brand">{providerLabel}</Badge>
            </div>
            <p className="text-[11px] text-slate-400">
              Natural-language agent testing with automatic MCP tool invocation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label
            className="p-2 bg-surface-900 border border-surface-800 hover:border-brand-500/30 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Import chat history JSON"
          >
            <Upload className="h-3.5 w-3.5" />
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>

          <Button
            size="icon"
            variant="ghost"
            onClick={handleExport}
            title="Export chat history as JSON"
            disabled={messages.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            variant={showSettings ? 'primary' : 'secondary'}
            onClick={() => setShowSettings(!showSettings)}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>AI Settings</span>
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={handleClear}
            title="Clear chat history"
            className="hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="p-5 bg-surface-900/40 border-b border-surface-800 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                AI Provider
              </label>
              <select
                value={config.provider}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    provider: e.target.value as AIProvider,
                    model:
                      e.target.value === 'gemini'
                        ? 'gemini-2.0-flash'
                        : e.target.value === 'ollama'
                        ? 'llama3.1'
                        : 'gpt-4o-mini'
                  })
                }
                className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
              >
                <option value="mock">Built-in Simulator (no key)</option>
                <option value="gemini">Google Gemini</option>
                <option value="ollama">Ollama / Local LLM</option>
                <option value="openai">OpenAI / Compatible</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                Model Identifier
              </label>
              <input
                type="text"
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                placeholder={config.provider === 'gemini' ? 'gemini-2.0-flash' : 'llama3.1'}
                className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
              />
            </div>

            {config.provider !== 'mock' && config.provider !== 'ollama' && (
              <div>
                <label className="flex items-center gap-1 text-slate-300 font-medium mb-1.5">
                  <Key className="h-3 w-3 text-brand-400" />
                  <span>API Key (stored locally)</span>
                </label>
                <input
                  type="password"
                  value={config.apiKey || ''}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder="AIzaSy... or sk-..."
                  className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                />
              </div>
            )}

            {config.provider === 'ollama' && (
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Ollama Base URL
                </label>
                <input
                  type="text"
                  value={config.endpoint || 'http://localhost:11434/v1'}
                  onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                  placeholder="http://localhost:11434/v1"
                  className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 p-5 overflow-y-auto space-y-5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-surface-900 border border-surface-800 flex items-center justify-center">
              <Bot className="h-6 w-6 text-brand-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Welcome to AI Chat Sandbox
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Test your MCP tools with an autonomous AI agent. Type a question
                or pick a suggestion below.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full pt-2">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(sug)}
                  className="p-3 bg-surface-900/60 hover:bg-surface-800 border border-surface-800 hover:border-brand-500/30 rounded-lg text-left text-xs text-slate-300 transition-colors group flex items-start gap-2"
                >
                  <ArrowRight className="h-3.5 w-3.5 text-brand-400 mt-0.5 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  <span>{sug}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                className={cn(
                  'flex gap-3 max-w-3xl',
                  isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'
                )}
              >
                {!isUser && (
                  <div className="h-8 w-8 rounded-lg bg-brand-600/15 border border-brand-500/25 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="h-4 w-4 text-brand-400" />
                  </div>
                )}

                <div className={cn('space-y-2 max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="space-y-2">
                      {m.toolCalls.map((tc) => {
                        const isExpanded = Boolean(expandedCalls[tc.id]);
                        return (
                          <div
                            key={tc.id}
                            className="bg-surface-900 border border-brand-500/25 rounded-lg overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => toggleCallExpand(tc.id)}
                              className="w-full flex items-center justify-between p-2.5 hover:bg-surface-800/60 text-left transition-colors"
                            >
                              <div className="flex items-center gap-2 text-xs">
                                <Wrench className="h-3.5 w-3.5 text-brand-400" />
                                <span className="font-medium text-slate-300">
                                  Tool call
                                </span>
                                <span className="font-mono text-brand-300 font-semibold bg-brand-600/15 px-2 py-0.5 rounded">
                                  {tc.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 text-[11px] font-mono">
                                {tc.latencyMs !== undefined && (
                                  <span className="text-emerald-400 flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span>{tc.latencyMs}ms</span>
                                  </span>
                                )}
                                {tc.status === 'calling' ? (
                                  <span className="text-amber-400 flex items-center gap-1">
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    <span>Running</span>
                                  </span>
                                ) : tc.status === 'success' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                                )}
                                {isExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                )}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="p-3 border-t border-surface-800 space-y-2 bg-surface-950/60 font-mono text-xs">
                                <div>
                                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                                    Arguments
                                  </div>
                                  <pre className="p-2 bg-surface-900 rounded-md text-slate-300 overflow-x-auto text-[11px]">
                                    {JSON.stringify(tc.args, null, 2)}
                                  </pre>
                                </div>

                                {tc.result && (
                                  <div>
                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                                      Result
                                    </div>
                                    <pre className="p-2 bg-surface-900 rounded-md text-brand-300 overflow-x-auto text-[11px]">
                                      {JSON.stringify(tc.result, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div
                    className={cn(
                      'rounded-2xl px-4 py-3 text-xs leading-relaxed',
                      isUser
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                        : 'bg-surface-900 border border-surface-800 text-slate-200'
                    )}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>

                  <div className="text-[10px] text-slate-400 font-mono px-1">
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                {isUser && (
                  <div className="h-8 w-8 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center shrink-0 mt-1">
                    <User className="h-4 w-4 text-slate-300" />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-surface-800 bg-surface-900/40 space-y-2">
        <div className="relative">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask the AI agent to execute tools from ${tools.length} active MCP capabilities...`}
            className="w-full bg-surface-900 border border-surface-800 rounded-xl px-4 py-2.5 pr-12 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60 resize-none"
          />
          <Button
            size="icon"
            variant="primary"
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="absolute right-2.5 bottom-2.5 h-8 w-8 rounded-lg"
            title="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono">
          <span>Enter to send · Shift+Enter for a new line</span>
          <span className="flex items-center gap-1">
            <Wrench className="h-3 w-3 text-brand-400" />
            <span>{tools.length} MCP tools exposed to agent</span>
          </span>
        </div>
      </div>
    </div>
  );
};
