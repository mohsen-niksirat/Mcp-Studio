import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ServerConfig,
  ServerState,
  ToolItem,
  ResourceItem,
  ResourceTemplateItem,
  PromptItem,
  JsonRpcMessageLog,
  ActiveTab
} from './types';
import { api } from './lib/api';
import { cn } from './lib/cn';
import { Button } from './components/ui/primitives';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { ToolsView } from './components/tools/ToolsView';
import { ResourcesView } from './components/resources/ResourcesView';
import { PromptsView } from './components/prompts/PromptsView';
import { TrafficView } from './components/traffic/TrafficView';
import { BenchmarkView } from './components/benchmark/BenchmarkView';
import { ChatSandboxView } from './components/chat/ChatSandboxView';
import { CollectionsView } from './components/collections/CollectionsView';
import { CommandPalette } from './components/layout/CommandPalette';
import { ServerModal } from './components/servers/ServerModal';
import { NAV_ITEMS } from './components/layout/Sidebar';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [activeState, setActiveState] = useState<ServerState | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('tools');

  // Active Server Primitives
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [templates, setTemplates] = useState<ResourceTemplateItem[]>([]);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [logs, setLogs] = useState<JsonRpcMessageLog[]>([]);

  // Loading states
  const [isLoadingServers, setIsLoadingServers] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingEntities, setIsLoadingEntities] = useState(false);

  // Modals
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<'create' | 'import'>('create');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [pendingTool, setPendingTool] = useState<string | null>(null);
  // Surfaced when the backend itself cannot be reached (distinct from
  // "no tools on the active server").
  const [backendError, setBackendError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimer = useRef<number | null>(null);
  const wsReconnectDelayRef = useRef(3000);
  const mountedRef = useRef(true);
  const connectSeqRef = useRef(0);
  const fetchInFlightRef = useRef(0);
  const fetchEntitiesRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const handleCrashRef = useRef<(serverId: string) => void>(() => {});

  const fetchActiveEntities = useCallback(async () => {
    const seq = connectSeqRef.current;
    fetchInFlightRef.current += 1;
    setIsLoadingEntities(true);
    try {
      const [toolList, resData, promptList] = await Promise.all([
        api.listTools().catch(() => []),
        api.listResources().catch(() => ({ resources: [], templates: [] })),
        api.listPrompts().catch(() => [])
      ]);
      if (connectSeqRef.current !== seq) return;
      setTools(toolList);
      setResources(resData.resources || []);
      setTemplates(resData.templates || []);
      setPrompts(promptList);
    } catch (e) {
      console.error('Failed to fetch MCP entities:', e);
    } finally {
      fetchInFlightRef.current -= 1;
      if (fetchInFlightRef.current === 0) {
        setIsLoadingEntities(false);
      }
    }
  }, []);

  const handleCrash = useCallback((serverId: string) => {
    setTools([]);
    setResources([]);
    setTemplates([]);
    setPrompts([]);
    // Offer a one-click clean-session reconnect instead of leaving the UI
    // parked on a dead state.
    if (serverId) {
      api.reconnect(serverId).catch((e) => console.warn('Reconnect failed:', e));
    }
  }, []);

  // Keep latest handlers reachable from stable socket callbacks.
  useEffect(() => {
    fetchEntitiesRef.current = fetchActiveEntities;
    handleCrashRef.current = handleCrash;
  }, [fetchActiveEntities, handleCrash]);

  // Initial data fetch & WebSocket connection
  useEffect(() => {
    mountedRef.current = true;
    loadServers();
    connectWebSocket();

    // Global keyboard shortcut: Ctrl+K / Cmd+K
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);

    // Listen to in-browser mock engine logs as well
    const unsubscribeBrowserLogs = api.getBrowserAdapter().onLog((log) => {
      setLogs((prev) => [...prev.slice(-300), log]);
    });

    return () => {
      mountedRef.current = false;
      window.removeEventListener('keydown', handleGlobalKey);
      if (wsReconnectTimer.current !== null) {
        window.clearTimeout(wsReconnectTimer.current);
        wsReconnectTimer.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      unsubscribeBrowserLogs();
    };
  }, []);

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'init') {
            if (data.state) setActiveState(data.state);
            if (data.logs) setLogs(data.logs);
          } else if (data.type === 'state:changed') {
            setActiveState(data.payload);
            if (data.payload.status === 'connected') {
              fetchEntitiesRef.current();
            }
          } else if (data.type === 'state:crashed') {
            setActiveState(data.payload);
            handleCrashRef.current(data.payload?.serverId || '');
          } else if (data.type === 'log') {
            setLogs((prev) => [...prev.slice(-300), data.payload]);
          } else if (data.type === 'logs:cleared') {
            setLogs([]);
          }
        } catch (e) {
          console.error('[WebSocket] Failed to parse message', e);
        }
      };

      ws.onopen = () => {
        // Successful connection: restore the fast reconnect cadence.
        wsReconnectDelayRef.current = 3000;
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        // Exponential backoff, capped at ~30s (tracked so we can cancel on
        // unmount; reset on successful open above).
        const delay = wsReconnectDelayRef.current;
        wsReconnectDelayRef.current = Math.min(delay * 2, 30000);
        wsReconnectTimer.current = window.setTimeout(connectWebSocket, delay);
      };
    } catch (e) {
      console.warn('[WebSocket] Connection failed', e);
    }
  };

  const loadServers = async () => {
    setIsLoadingServers(true);
    setBackendError(null);
    try {
      const data = await api.getServers();
      setServers(data.servers);
      if (data.activeState) {
        setActiveState(data.activeState);
        if (data.activeState.status === 'connected') {
          fetchActiveEntities();
        }
      } else if (data.servers.length > 0) {
        // Auto-connect to demo server on initial launch
        const demo = data.servers.find((s) => s.id === 'demo-mock-server') || data.servers[0];
        handleConnect(demo.id);
      }
    } catch (e: any) {
      // The backend exists as a process but every probe failed: say so
      // instead of leaving the user with silent empty panes.
      setBackendError(e?.message || 'Cannot reach the MCP-Studio backend.');
      console.error(e);
    } finally {
      setIsLoadingServers(false);
    }
  };

  const handleConnect = async (id: string) => {
    const seq = ++connectSeqRef.current;
    setIsConnecting(true);
    try {
      const state = await api.connect(id);
      if (connectSeqRef.current !== seq) return;
      setActiveState(state);
      await fetchActiveEntities();
    } catch (e: any) {
      if (connectSeqRef.current !== seq) return;
      console.error('Connection failed', e);
    } finally {
      if (connectSeqRef.current === seq) {
        setIsConnecting(false);
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.disconnect();
      setActiveState((prev) => (prev ? { ...prev, status: 'disconnected' } : null));
      setTools([]);
      setResources([]);
      setTemplates([]);
      setPrompts([]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleServerAdded = (newConfig: ServerConfig) => {
    // Merge by id: re-adding an existing server (e.g. a re-import) must
    // replace it instead of appending a duplicate.
    setServers((prev) => {
      const idx = prev.findIndex((s) => s.id === newConfig.id);
      if (idx === -1) return [...prev, newConfig];
      const next = [...prev];
      next[idx] = newConfig;
      return next;
    });
    handleConnect(newConfig.id);
  };

  const handleClearLogs = async () => {
    try {
      await api.clearLogs();
      setLogs([]);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-surface-950 text-slate-100 overflow-hidden">
      {/* Top Header */}
      <Navbar
        servers={servers}
        activeState={activeState}
        onSelectServer={handleConnect}
        onDisconnect={handleDisconnect}
        onOpenAddServer={() => {
          setModalInitialTab('create');
          setIsServerModalOpen(true);
        }}
        onRefresh={() => {
          loadServers();
          if (activeState?.status === 'connected') fetchActiveEntities();
        }}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        isConnecting={isConnecting}
      />

      {/* Backend unreachable: visible app-level error state (R-27) */}
      {backendError && (
        <div
          role="alert"
          className="flex items-center gap-3 px-4 py-2.5 bg-rose-950/30 border-b border-rose-500/25 text-sm"
        >
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span className="text-rose-200 min-w-0">
            {backendError} Start the backend (`pnpm dev`) or the desktop launcher, then retry.
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto shrink-0"
            onClick={loadServers}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        </div>
      )}

      {/* Compact tab strip replaces the sidebar on narrow viewports (R-03) */}
      <nav
        aria-label="Workspaces"
        className="md:hidden flex items-center gap-1 overflow-x-auto border-b border-surface-800 bg-surface-950 px-2 py-1.5 shrink-0"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors',
                isActive
                  ? 'bg-brand-600/15 text-brand-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-900/60'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Studio Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          toolCount={tools.length}
          resourceCount={resources.length + templates.length}
          promptCount={prompts.length}
          logCount={logs.length}
          activeState={activeState}
          onOpenImport={() => {
            setModalInitialTab('import');
            setIsServerModalOpen(true);
          }}
        />

        {/* Viewport Content */}
        <main className="flex-1 flex overflow-hidden">
          {activeTab === 'chat' && (
            <ChatSandboxView tools={tools} />
          )}

          {activeTab === 'tools' && (
            <ToolsView
              tools={tools}
              isLoading={isLoadingEntities}
              activeState={activeState}
              pendingSelectTool={pendingTool}
              onPendingToolConsumed={() => setPendingTool(null)}
            />
          )}

          {activeTab === 'resources' && (
            <ResourcesView
              resources={resources}
              templates={templates}
              isLoading={isLoadingEntities}
            />
          )}

          {activeTab === 'prompts' && (
            <PromptsView prompts={prompts} isLoading={isLoadingEntities} />
          )}

          {activeTab === 'collections' && (
            <CollectionsView tools={tools} />
          )}

          {activeTab === 'traffic' && (
            <TrafficView
              logs={logs}
              onClear={handleClearLogs}
              activeServerId={activeState?.config.id}
            />
          )}

          {activeTab === 'benchmark' && (
            <BenchmarkView activeState={activeState} />
          )}
        </main>
      </div>

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setIsCommandPaletteOpen(false);
        }}
        tools={tools}
        onSelectTool={(toolName) => {
          setPendingTool(toolName);
          setActiveTab('tools');
        }}
        onOpenAddServer={() => {
          setModalInitialTab('create');
          setIsServerModalOpen(true);
        }}
        onOpenImport={() => {
          setModalInitialTab('import');
          setIsServerModalOpen(true);
        }}
        onClearLogs={handleClearLogs}
      />

      {/* Add / Import Server Modal */}
      <ServerModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        onServerAdded={handleServerAdded}
        initialTab={modalInitialTab}
      />
    </div>
  );
};
