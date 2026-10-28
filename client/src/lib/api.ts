import {
  ServerConfig,
  ServerState,
  ToolItem,
  ResourceItem,
  ResourceTemplateItem,
  PromptItem,
  JsonRpcMessageLog,
  BenchmarkStats
} from '../types';
import { BrowserMCPAdapter } from './browser-mcp';

const API_BASE = '/api';
const browserAdapter = new BrowserMCPAdapter();
let isStandaloneWeb = false;

export const api = {
  isWebStandalone(): boolean {
    return isStandaloneWeb;
  },

  getBrowserAdapter(): BrowserMCPAdapter {
    return browserAdapter;
  },

  async getServers(): Promise<{ servers: ServerConfig[]; activeState: ServerState | null }> {
    // Two probes: a single 2s timeout can race a cold backend start and
    // permanently strand the session in standalone mode even though the
    // backend is up. Without a backend (GitHub Pages demo) the probe fails
    // fast, so the extra attempt costs nothing there.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${API_BASE}/servers`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) throw new Error('Backend not available');
        isStandaloneWeb = false;
        return res.json();
      } catch {
        // Retry once before switching to In-Browser Web Mode.
      }
    }
    isStandaloneWeb = true;
    return {
      servers: browserAdapter.getServers(),
      activeState: browserAdapter.getActiveState()
    };
  },

  async addServer(config: Partial<ServerConfig>): Promise<ServerConfig> {
    if (isStandaloneWeb) {
      const newConfig: ServerConfig = {
        id: `browser-custom-${Date.now()}`,
        name: config.name || 'Custom Server',
        transport: config.transport || 'mock',
        url: config.url,
        createdAt: Date.now()
      };
      return newConfig;
    }

    const res = await fetch(`${API_BASE}/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add server' }));
      throw new Error(err.error || 'Failed to add server');
    }
    return res.json();
  },

  async removeServer(id: string): Promise<boolean> {
    if (isStandaloneWeb) return true;
    const res = await fetch(`${API_BASE}/servers/${id}`, { method: 'DELETE' });
    return res.ok;
  },

  async connect(id: string): Promise<ServerState> {
    if (isStandaloneWeb) {
      return browserAdapter.getActiveState();
    }
    const res = await fetch(`${API_BASE}/servers/${id}/connect`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Connection failed' }));
      throw new Error(err.error || 'Connection failed');
    }
    return res.json();
  },

  async disconnect(): Promise<void> {
    if (isStandaloneWeb) return;
    await fetch(`${API_BASE}/servers/disconnect`, { method: 'POST' });
  },

  async getActiveState(): Promise<ServerState | null> {
    if (isStandaloneWeb) return browserAdapter.getActiveState();
    const res = await fetch(`${API_BASE}/servers/active/state`);
    const data = await res.json();
    return data.state;
  },

  async listTools(): Promise<ToolItem[]> {
    if (isStandaloneWeb) return browserAdapter.listTools();
    const res = await fetch(`${API_BASE}/servers/active/tools`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch tools' }));
      throw new Error(err.error || 'Failed to fetch tools');
    }
    const data = await res.json();
    return data.tools || [];
  },

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (isStandaloneWeb) return browserAdapter.callTool(name, args);
    const res = await fetch(`${API_BASE}/servers/active/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Tool execution failed' }));
      throw new Error(err.error || 'Tool execution failed');
    }
    return res.json();
  },

  async listResources(): Promise<{ resources: ResourceItem[]; templates: ResourceTemplateItem[] }> {
    if (isStandaloneWeb) return browserAdapter.listResources();
    const res = await fetch(`${API_BASE}/servers/active/resources`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch resources' }));
      throw new Error(err.error || 'Failed to fetch resources');
    }
    return res.json();
  },

  async readResource(uri: string): Promise<any> {
    if (isStandaloneWeb) return browserAdapter.readResource(uri);
    const res = await fetch(`${API_BASE}/servers/active/resources/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to read resource' }));
      throw new Error(err.error || 'Failed to read resource');
    }
    return res.json();
  },

  async listPrompts(): Promise<PromptItem[]> {
    if (isStandaloneWeb) return browserAdapter.listPrompts();
    const res = await fetch(`${API_BASE}/servers/active/prompts`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch prompts' }));
      throw new Error(err.error || 'Failed to fetch prompts');
    }
    const data = await res.json();
    return data.prompts || [];
  },

  async getPrompt(name: string, args: Record<string, any>): Promise<any> {
    if (isStandaloneWeb) return browserAdapter.getPrompt(name, args);
    const res = await fetch(`${API_BASE}/servers/active/prompts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to generate prompt' }));
      throw new Error(err.error || 'Failed to generate prompt');
    }
    return res.json();
  },

  async runBenchmark(iterations = 5): Promise<BenchmarkStats> {
    if (isStandaloneWeb) return browserAdapter.runBenchmark(iterations);
    const res = await fetch(`${API_BASE}/servers/active/benchmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iterations })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Benchmark failed' }));
      throw new Error(err.error || 'Benchmark failed');
    }
    return res.json();
  },

  async getLogs(limit = 100): Promise<JsonRpcMessageLog[]> {
    if (isStandaloneWeb) return browserAdapter.getLogs(limit);
    const res = await fetch(`${API_BASE}/logs?limit=${limit}`);
    const data = await res.json();
    return data.logs || [];
  },

  async clearLogs(): Promise<void> {
    if (isStandaloneWeb) {
      browserAdapter.clearLogs();
      return;
    }
    await fetch(`${API_BASE}/logs`, { method: 'DELETE' });
  },

  async detectConfigs(): Promise<{ detected: any[] }> {
    if (isStandaloneWeb) return { detected: [] };
    const res = await fetch(`${API_BASE}/import/detect`);
    return res.json();
  },

  async importServers(servers: any[]): Promise<any> {
    if (isStandaloneWeb) return { importedCount: 0, imported: [] };
    const res = await fetch(`${API_BASE}/import/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servers })
    });
    return res.json();
  }
};
