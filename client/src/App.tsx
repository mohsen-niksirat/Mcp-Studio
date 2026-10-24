import React, { useState, useEffect, useRef } from 'react';
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
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { ToolsView } from './components/tools/ToolsView';
import { ResourcesView } from './components/resources/ResourcesView';
import { PromptsView } from './components/prompts/PromptsView';
import { TrafficView } from './components/traffic/TrafficView';
import { BenchmarkView } from './components/benchmark/BenchmarkView';
import { ServerModal } from './components/servers/ServerModal';

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

  const wsRef = useRef<WebSocket | null>(null);

  // Initial data fetch & WebSocket connection
  useEffect(() => {
    loadServers();
    setupWebSocket();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  const setupWebSocket = () => {
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
              fetchActiveEntities();
            }
          } else if (data.type === 'log') {
            setLogs((prev) => [...prev.slice(-300), data.payload]);
          } else if (data.type === 'logs:cleared') {
            setLogs([]);
          }
        } catch (e) {
          console.error('[WebSocket] Failed to parse message', e);
        }
      };

      ws.onclose = () => {
        // Reconnect after 3 seconds
        setTimeout(setupWebSocket, 3000);
      };
    } catch (e) {
      console.warn('[WebSocket] Connection failed', e);
    }
  };

  const loadServers = async () => {
    setIsLoadingServers(true);
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
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingServers(false);
    }
  };

  const fetchActiveEntities = async () => {
    setIsLoadingEntities(true);
    try {
      const [toolList, resData, promptList] = await Promise.all([
        api.listTools().catch(() => []),
        api.listResources().catch(() => ({ resources: [], templates: [] })),
        api.listPrompts().catch(() => [])
      ]);
      setTools(toolList);
      setResources(resData.resources || []);
      setTemplates(resData.templates || []);
      setPrompts(promptList);
    } catch (e) {
      console.error('Failed to fetch MCP entities:', e);
    } finally {
      setIsLoadingEntities(false);
    }
  };

  const handleConnect = async (id: string) => {
    setIsConnecting(true);
    try {
      const state = await api.connect(id);
      setActiveState(state);
      await fetchActiveEntities();
    } catch (e: any) {
      console.error('Connection failed', e);
    } finally {
      setIsConnecting(false);
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
    setServers((prev) => [...prev, newConfig]);
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
    <div className="flex flex-col h-screen bg-[#090d16] text-slate-100 overflow-hidden">
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
        isConnecting={isConnecting}
      />

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
          {activeTab === 'tools' && (
            <ToolsView tools={tools} isLoading={isLoadingEntities} />
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

          {activeTab === 'traffic' && (
            <TrafficView logs={logs} onClear={handleClearLogs} />
          )}

          {activeTab === 'benchmark' && (
            <BenchmarkView activeState={activeState} />
          )}
        </main>
      </div>

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
