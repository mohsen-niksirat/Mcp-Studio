import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  User,
  Send,
  Sparkles,
  Sliders,
  Trash2,
  Key,
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { ToolItem, ChatMessage, ChatConfig, AIProvider } from '../../types';
import { ChatSandboxService } from '../../lib/chat-service';

interface ChatSandboxViewProps {
  tools: ToolItem[];
}

export const ChatSandboxView: React.FC<ChatSandboxViewProps> = ({ tools }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('mcp_studio_chat_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedCalls, setExpandedCalls] = useState<Record<string, boolean>>({});

  // Config state (persisted to localStorage)
  const [config, setConfig] = useState<ChatConfig>(() => {
    const saved = localStorage.getItem('mcp_studio_chat_config');
    return saved
      ? JSON.parse(saved)
      : {
          provider: 'mock' as AIProvider,
          apiKey: '',
          model: 'gemini-2.0-flash',
          endpoint: 'http://localhost:11434/v1',
          temperature: 0.7,
          systemPrompt:
            'You are an autonomous AI assistant powered by MCP-Studio. You have access to real-time tools. Use the provided tools whenever they help answer the user question accurately.'
        };
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('mcp_studio_chat_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('mcp_studio_chat_history', JSON.stringify(messages));
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
            } else {
              return [...prev, partialAssistantMsg];
            }
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

  const toggleCallExpand = (id: string) => {
    setExpandedCalls((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const suggestions = [
    'What are the host CPU specs and available RAM?',
    'Calculate 2 to the power of 16 using math_calculator',
    'Generate 4 mock developer user profiles',
    'Prettify this JSON: {"id":1,"status":"ok","count":42}'
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#090d16] overflow-hidden">
      {/* Top Header & Settings Bar */}
      <div className="px-6 py-3.5 border-b border-slate-800 bg-[#0d1424] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Bot className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-slate-100">AI Chat Sandbox</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {config.provider === 'mock'
                  ? 'Built-in Agent Simulator'
                  : config.provider === 'gemini'
                  ? `Gemini (${config.model})`
                  : config.provider === 'ollama'
                  ? `Ollama (${config.model})`
                  : 'OpenAI'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Natural language agent testing with automatic MCP tool invocation
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              showSettings
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>AI Settings</span>
          </button>

          <button
            onClick={handleClear}
            title="Clear Chat History"
            className="p-2 bg-slate-900 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 rounded-xl transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Settings Drawer */}
      {showSettings && (
        <div className="p-6 bg-[#0c1222] border-b border-slate-800 animate-fade-in space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Provider Switcher */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                AI Provider / Engine
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
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="mock">Built-in Simulator (No API Key Required)</option>
                <option value="gemini">Google Gemini (Gemini 2.5 / 2.0 Flash)</option>
                <option value="ollama">Ollama / Local LLM (localhost:11434)</option>
                <option value="openai">OpenAI / Compatible Endpoint</option>
              </select>
            </div>

            {/* Model Name */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">Model Identifier</label>
              <input
                type="text"
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                placeholder={config.provider === 'gemini' ? 'gemini-2.0-flash' : 'llama3.1'}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* API Key (if Gemini / OpenAI) */}
            {config.provider !== 'mock' && config.provider !== 'ollama' && (
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5 flex items-center space-x-1">
                  <Key className="h-3 w-3 text-indigo-400" />
                  <span>API Key (Stored locally in browser)</span>
                </label>
                <input
                  type="password"
                  value={config.apiKey || ''}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder="AIzaSy... or sk-..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {/* Endpoint (if Ollama / Custom) */}
            {config.provider === 'ollama' && (
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Ollama Base URL</label>
                <input
                  type="text"
                  value={config.endpoint || 'http://localhost:11434/v1'}
                  onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                  placeholder="http://localhost:11434/v1"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Welcome to AI Chat Sandbox</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Test your MCP tools dynamically with an autonomous AI agent. Type a question or click a suggestion below:
              </p>
            </div>

            {/* Quick Suggestion Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full pt-2">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(sug)}
                  className="p-3 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/30 rounded-xl text-left text-xs text-slate-300 transition-all group flex items-start space-x-2"
                >
                  <ArrowRight className="h-3.5 w-3.5 text-indigo-400 mt-0.5 shrink-0 group-hover:translate-x-0.5 transition-transform" />
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
                className={`flex space-x-3 max-w-3xl ${isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'}`}
              >
                {!isUser && (
                  <div className="h-8 w-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="h-4 w-4 text-indigo-400" />
                  </div>
                )}

                <div className={`space-y-2 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                  {/* Tool Call Cards (Visual Agent Actions) */}
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="space-y-2">
                      {m.toolCalls.map((tc) => {
                        const isExpanded = Boolean(expandedCalls[tc.id]);
                        return (
                          <div
                            key={tc.id}
                            className="bg-slate-900/90 border border-indigo-500/30 rounded-xl overflow-hidden shadow-lg"
                          >
                            <button
                              type="button"
                              onClick={() => toggleCallExpand(tc.id)}
                              className="w-full flex items-center justify-between p-2.5 bg-indigo-950/20 hover:bg-indigo-950/40 text-left transition-colors"
                            >
                              <div className="flex items-center space-x-2 text-xs">
                                <Wrench className="h-3.5 w-3.5 text-indigo-400" />
                                <span className="font-semibold text-slate-200">
                                  Invoked Tool:
                                </span>
                                <span className="font-mono text-indigo-300 font-bold bg-indigo-500/20 px-2 py-0.5 rounded">
                                  {tc.name}
                                </span>
                              </div>

                              <div className="flex items-center space-x-2 text-[11px] font-mono">
                                {tc.latencyMs !== undefined && (
                                  <span className="text-emerald-400 flex items-center space-x-1">
                                    <Clock className="h-3 w-3" />
                                    <span>{tc.latencyMs}ms</span>
                                  </span>
                                )}
                                {tc.status === 'calling' ? (
                                  <span className="text-amber-400 flex items-center space-x-1">
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    <span>Running</span>
                                  </span>
                                ) : tc.status === 'success' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                                )}
                                {isExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                                )}
                              </div>
                            </button>

                            {/* Expanded Details */}
                            {isExpanded && (
                              <div className="p-3 border-t border-slate-800 space-y-2 bg-slate-950/60 font-mono text-xs">
                                <div>
                                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                                    Arguments
                                  </div>
                                  <pre className="p-2 bg-slate-900 rounded-lg text-slate-300 overflow-x-auto text-[11px]">
                                    {JSON.stringify(tc.args, null, 2)}
                                  </pre>
                                </div>

                                {tc.result && (
                                  <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                                      Raw Result
                                    </div>
                                    <pre className="p-2 bg-slate-900 rounded-lg text-indigo-300 overflow-x-auto text-[11px]">
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

                  {/* Main Bubble Content */}
                  <div
                    className={`rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                        : 'bg-slate-900/90 border border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="whitespace-pre-wrap font-sans">{m.content}</div>
                  </div>

                  <div className="text-[10px] text-slate-500 font-mono px-1">
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                {isUser && (
                  <div className="h-8 w-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-1">
                    <User className="h-4 w-4 text-slate-300" />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-4 border-t border-slate-800 bg-[#0d1424] space-y-2">
        <div className="flex items-center space-x-2">
          <div className="flex-1 relative">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask the AI agent to execute tools from ${tools.length} active MCP capabilities...`}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none pr-12"
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="absolute right-2.5 bottom-3.5 h-8 w-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center disabled:opacity-40 transition-all shadow-md shadow-indigo-600/20"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 px-2 font-mono">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span className="flex items-center space-x-1">
            <Wrench className="h-3 w-3 text-indigo-400" />
            <span>{tools.length} MCP tools exposed to agent</span>
          </span>
        </div>
      </div>
    </div>
  );
};
