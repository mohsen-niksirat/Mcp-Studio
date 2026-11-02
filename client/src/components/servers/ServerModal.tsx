import React, { useState, useEffect } from 'react';
import { Download, Globe, Plus, Sparkles, Terminal, X } from 'lucide-react';
import { ServerConfig, TransportType } from '../../types';
import { api } from '../../lib/api';
import { Button } from '../ui/primitives';
import { cn } from '../../lib/cn';

interface ServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerAdded: (config: ServerConfig) => void;
  initialTab?: 'create' | 'import';
}

/**
 * Split an args string on spaces, keeping double-quoted segments together
 * (e.g. --root "C:\Program Files\server"). Escaped quotes inside quoted
 * segments become literal quotes. Returns null when quotes are unbalanced so
 * the caller can fall back to the naive space split.
 */
const splitArgsRespectingQuotes = (input: string): string[] | null => {
  const args: string[] = [];
  let current = '';
  let inQuote = false;
  let tokenStarted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '\\' && inQuote && input[i + 1] === '"') {
      current += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuote = !inQuote;
      tokenStarted = true;
      continue;
    }
    if (ch === ' ' && !inQuote) {
      if (current || tokenStarted) {
        args.push(current);
        current = '';
        tokenStarted = false;
      }
      continue;
    }
    current += ch;
    tokenStarted = true;
  }
  if (inQuote) return null;
  if (current || tokenStarted) args.push(current);
  return args;
};

export const ServerModal: React.FC<ServerModalProps> = ({
  isOpen,
  onClose,
  onServerAdded,
  initialTab = 'create'
}) => {
  const [tab, setTab] = useState<'create' | 'import'>(initialTab);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<TransportType>('stdio');
  const [command, setCommand] = useState('npx');
  const [argsStr, setArgsStr] = useState('-y @modelcontextprotocol/server-filesystem C:\\Users');
  const [url, setUrl] = useState('http://localhost:8000/sse');
  const [envStr, setEnvStr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detectedConfigs, setDetectedConfigs] = useState<any[]>([]);
  const [isLoadingDetected, setIsLoadingDetected] = useState(false);
  const [selectedToImport, setSelectedToImport] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    // Fresh state on every open so stale values/errors never leak across
    // modal sessions.
    setTab(initialTab);
    setName('');
    setTransport('stdio');
    setCommand('npx');
    setArgsStr('-y @modelcontextprotocol/server-filesystem C:\\Users');
    setUrl('http://localhost:8000/sse');
    setEnvStr('');
    setIsSubmitting(false);
    setError(null);
    setDetectedConfigs([]);
    setIsLoadingDetected(false);
    setSelectedToImport({});
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && tab === 'import') {
      loadDetected();
    }
  }, [isOpen, tab]);

  const loadDetected = async () => {
    setIsLoadingDetected(true);
    try {
      const data = await api.detectConfigs();
      setDetectedConfigs(data.detected || []);
      const initialSelected: Record<string, boolean> = {};
      data.detected?.forEach((g: any) => {
        g.servers?.forEach((s: any) => {
          initialSelected[s.id] = true;
        });
      });
      setSelectedToImport(initialSelected);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingDetected(false);
    }
  };

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a server name');
      return;
    }

    if (transport === 'sse') {
      let urlOk = false;
      try {
        const parsedUrl = new URL(url);
        urlOk = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
      } catch {
        urlOk = false;
      }
      if (!urlOk) {
        setError('Please provide a valid http(s) URL for the SSE endpoint');
        return;
      }
    }

    const trimmedArgs = argsStr.trim();
    let args: string[];
    if (trimmedArgs.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmedArgs);
        if (!Array.isArray(parsed) || parsed.some((a) => typeof a !== 'string')) {
          throw new Error('not a string array');
        }
        args = parsed;
      } catch {
        setError('Arguments must be a JSON array of strings, e.g. ["-y", "@server/filesystem"]');
        return;
      }
    } else {
      args = splitArgsRespectingQuotes(trimmedArgs) ?? trimmedArgs.split(' ').filter(Boolean);
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let parsedEnv: Record<string, string> | undefined;
      if (envStr.trim()) {
        try {
          parsedEnv = JSON.parse(envStr);
        } catch {
          parsedEnv = {};
          envStr.split('\n').forEach((line) => {
            const [k, ...v] = line.split('=');
            if (k) parsedEnv![k.trim()] = v.join('=').trim();
          });
        }
      }

      const created = await api.addServer({
        name,
        transport,
        command: transport === 'stdio' ? command : undefined,
        args: transport === 'stdio' ? args : undefined,
        env: parsedEnv,
        url: transport === 'sse' ? url : undefined
      });

      onServerAdded(created);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportSubmit = async () => {
    const serversToImport: any[] = [];
    detectedConfigs.forEach((g) => {
      g.servers.forEach((s: any) => {
        if (selectedToImport[s.id]) {
          serversToImport.push(s);
        }
      });
    });

    if (serversToImport.length === 0) {
      setError('No servers selected to import');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.importServers(serversToImport);
      const updated = await api.getServers();
      if (updated.servers.length > 0) {
        onServerAdded(updated.servers[updated.servers.length - 1]);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="bg-surface-950 border border-surface-800 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-400" />
            <h2 id="server-modal-title" className="text-sm font-semibold text-slate-100">
              MCP Server Management
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-md hover:bg-surface-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-800 px-5">
          <button
            onClick={() => setTab('create')}
            className={cn(
              'py-3 px-3 text-xs font-medium border-b-2 transition-colors',
              tab === 'create'
                ? 'border-brand-500 text-brand-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            Add New Server
          </button>
          <button
            onClick={() => setTab('import')}
            className={cn(
              'py-3 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5',
              tab === 'import'
                ? 'border-brand-500 text-brand-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Auto-Import (Claude & Cursor)</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-rose-950/20 border border-rose-500/25 rounded-lg text-rose-300 text-xs">
              {error}
            </div>
          )}

          {tab === 'create' ? (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="server-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Server Name
                </label>
                <input
                  id="server-name"
                  type="text"
                  placeholder="e.g. Local Filesystem MCP"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-900 border border-surface-800 rounded-md px-3.5 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Transport Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTransport('stdio')}
                    className={cn(
                      'flex items-center gap-2.5 p-3 rounded-lg border text-left transition-colors',
                      transport === 'stdio'
                        ? 'bg-brand-600/15 border-brand-500/40 text-brand-200'
                        : 'bg-surface-900/60 border-surface-800 text-slate-400 hover:border-surface-700'
                    )}
                  >
                    <Terminal className="h-4 w-4 shrink-0 text-brand-400" />
                    <div>
                      <div className="text-xs font-semibold">stdio (Subprocess)</div>
                      <div className="text-[11px] text-slate-500">npx, python, node, uvx</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransport('sse')}
                    className={cn(
                      'flex items-center gap-2.5 p-3 rounded-lg border text-left transition-colors',
                      transport === 'sse'
                        ? 'bg-brand-600/15 border-brand-500/40 text-brand-200'
                        : 'bg-surface-900/60 border-surface-800 text-slate-400 hover:border-surface-700'
                    )}
                  >
                    <Globe className="h-4 w-4 shrink-0 text-brand-400" />
                    <div>
                      <div className="text-xs font-semibold">SSE (Remote HTTP)</div>
                      <div className="text-[11px] text-slate-500">Server-Sent Events URL</div>
                    </div>
                  </button>
                </div>
              </div>

              {transport === 'stdio' ? (
                <>
                  <div>
                    <label htmlFor="server-command" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Command
                    </label>
                    <input
                      id="server-command"
                      type="text"
                      placeholder="npx or python or node"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      className="w-full bg-surface-900 border border-surface-800 rounded-md px-3.5 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                    />
                  </div>
                  <div>
                    <label htmlFor="server-args" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Arguments (space separated)
                    </label>
                    <input
                      id="server-args"
                      type="text"
                      placeholder="-y @modelcontextprotocol/server-filesystem C:\Path"
                      value={argsStr}
                      onChange={(e) => setArgsStr(e.target.value)}
                      className="w-full bg-surface-900 border border-surface-800 rounded-md px-3.5 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                    />
                  </div>
                  <div>
                    <label htmlFor="server-env" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Environment Variables (KEY=VALUE or JSON)
                    </label>
                    <textarea
                      id="server-env"
                      rows={2}
                      placeholder="API_KEY=xyz123&#10;DEBUG=true"
                      value={envStr}
                      onChange={(e) => setEnvStr(e.target.value)}
                      className="w-full bg-surface-900 border border-surface-800 rounded-md px-3.5 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60 resize-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="server-url" className="block text-xs font-medium text-slate-300 mb-1.5">
                    SSE Endpoint URL
                  </label>
                  <input
                    id="server-url"
                    type="url"
                    placeholder="http://localhost:8000/sse"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-surface-900 border border-surface-800 rounded-md px-3.5 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                  />
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  <Plus className="h-3.5 w-3.5" />
                  {isSubmitting ? 'Saving...' : 'Add Server'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                MCP-Studio automatically scanned your system for MCP configurations
                in Claude Desktop, Cursor, and Antigravity.
              </p>

              {isLoadingDetected ? (
                <div className="py-8 text-center text-xs text-slate-500 font-mono">
                  Scanning config files...
                </div>
              ) : detectedConfigs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 bg-surface-900/40 border border-surface-800 rounded-lg">
                  No existing MCP configuration files found on standard system paths.
                </div>
              ) : (
                <div className="space-y-3">
                  {detectedConfigs.map((group, gIdx) => (
                    <div key={gIdx} className="bg-surface-900/70 border border-surface-800 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                        <span className="capitalize text-brand-300 font-semibold">
                          {group.source} Config
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 truncate max-w-[280px]">
                          {group.filePath}
                        </span>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        {group.servers.map((s: any) => (
                          <label
                            key={s.id}
                            className="flex items-center gap-3 p-2 bg-surface-800/40 hover:bg-surface-800/80 rounded-md cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(selectedToImport[s.id])}
                              onChange={(e) =>
                                setSelectedToImport({
                                  ...selectedToImport,
                                  [s.id]: e.target.checked
                                })
                              }
                              className="rounded bg-surface-900 border-surface-700 text-brand-600 focus:ring-brand-500/40 focus:ring-offset-0"
                            />
                            <div className="flex-1 truncate">
                              <div className="text-xs font-medium text-slate-200">{s.name}</div>
                              <div className="text-[11px] font-mono text-slate-500 truncate">
                                {s.command} {s.args?.join(' ')}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="pt-2 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button variant="primary" onClick={handleImportSubmit} disabled={isSubmitting}>
                      <Download className="h-3.5 w-3.5" />
                      {isSubmitting ? 'Importing...' : 'Import Selected'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
