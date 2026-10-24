import React, { useState, useEffect } from 'react';
import { X, Plus, Terminal, Globe, Download, Check, Sparkles, Folder } from 'lucide-react';
import { ServerConfig, TransportType } from '../../types';
import { api } from '../../lib/api';

interface ServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerAdded: (config: ServerConfig) => void;
  initialTab?: 'create' | 'import';
}

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

  // Import state
  const [detectedConfigs, setDetectedConfigs] = useState<any[]>([]);
  const [isLoadingDetected, setIsLoadingDetected] = useState(false);
  const [selectedToImport, setSelectedToImport] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

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
    } catch (e: any) {
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

    setIsSubmitting(true);
    setError(null);

    try {
      let parsedEnv: Record<string, string> | undefined;
      if (envStr.trim()) {
        try {
          parsedEnv = JSON.parse(envStr);
        } catch {
          // parse KEY=VAL lines
          parsedEnv = {};
          envStr.split('\n').forEach((line) => {
            const [k, ...v] = line.split('=');
            if (k) parsedEnv![k.trim()] = v.join('=').trim();
          });
        }
      }

      const args = argsStr
        .trim()
        .split(' ')
        .filter(Boolean);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">MCP Server Management</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 px-6">
          <button
            onClick={() => setTab('create')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              tab === 'create'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Add New Server
          </button>
          <button
            onClick={() => setTab('import')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
              tab === 'import'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Auto-Import (Claude & Cursor)</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
              {error}
            </div>
          )}

          {tab === 'create' ? (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Server Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Local Filesystem MCP"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Transport Switcher */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Transport Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTransport('stdio')}
                    className={`flex items-center space-x-2.5 p-3 rounded-xl border text-left transition-all ${
                      transport === 'stdio'
                        ? 'bg-indigo-600/15 border-indigo-500/40 text-indigo-200'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Terminal className="h-4 w-4 shrink-0 text-indigo-400" />
                    <div>
                      <div className="text-xs font-semibold">stdio (Subprocess)</div>
                      <div className="text-[11px] text-slate-500">npx, python, node, uvx</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransport('sse')}
                    className={`flex items-center space-x-2.5 p-3 rounded-xl border text-left transition-all ${
                      transport === 'sse'
                        ? 'bg-indigo-600/15 border-indigo-500/40 text-indigo-200'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Globe className="h-4 w-4 shrink-0 text-indigo-400" />
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
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Command
                    </label>
                    <input
                      type="text"
                      placeholder="npx or python or node"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Arguments (space separated)
                    </label>
                    <input
                      type="text"
                      placeholder="-y @modelcontextprotocol/server-filesystem C:\Path"
                      value={argsStr}
                      onChange={(e) => setArgsStr(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Environment Variables (KEY=VALUE or JSON)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="API_KEY=xyz123&#10;DEBUG=true"
                      value={envStr}
                      onChange={(e) => setEnvStr(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    SSE Endpoint URL
                  </label>
                  <input
                    type="url"
                    placeholder="http://localhost:8000/sse"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
                >
                  {isSubmitting ? 'Saving...' : 'Add Server'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                MCP-Studio automatically scanned your system for MCP configurations in Claude Desktop and Cursor.
              </p>

              {isLoadingDetected ? (
                <div className="py-8 text-center text-xs text-slate-500 font-mono">
                  Scanning config files...
                </div>
              ) : detectedConfigs.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 bg-slate-900/40 border border-slate-800 rounded-xl">
                  No existing MCP configuration files found on standard system paths.
                </div>
              ) : (
                <div className="space-y-3">
                  {detectedConfigs.map((group, gIdx) => (
                    <div key={gIdx} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                        <span className="capitalize text-indigo-400 font-semibold">
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
                            className="flex items-center space-x-3 p-2 bg-slate-800/40 hover:bg-slate-800/80 rounded-lg cursor-pointer transition-colors"
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
                              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
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

                  <div className="pt-2 flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImportSubmit}
                      disabled={isSubmitting}
                      className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all flex items-center space-x-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{isSubmitting ? 'Importing...' : 'Import Selected'}</span>
                    </button>
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
