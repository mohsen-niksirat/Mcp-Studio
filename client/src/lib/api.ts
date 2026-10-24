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

const API_BASE = '/api';

export const api = {
  async getServers(): Promise<{ servers: ServerConfig[]; activeState: ServerState | null }> {
    const res = await fetch(`${API_BASE}/servers`);
    if (!res.ok) throw new Error('Failed to fetch servers');
    return res.json();
  },

  async addServer(config: Partial<ServerConfig>): Promise<ServerConfig> {
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
    const res = await fetch(`${API_BASE}/servers/${id}`, { method: 'DELETE' });
    return res.ok;
  },

  async connect(id: string): Promise<ServerState> {
    const res = await fetch(`${API_BASE}/servers/${id}/connect`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Connection failed' }));
      throw new Error(err.error || 'Connection failed');
    }
    return res.json();
  },

  async disconnect(): Promise<void> {
    await fetch(`${API_BASE}/servers/disconnect`, { method: 'POST' });
  },

  async getActiveState(): Promise<ServerState | null> {
    const res = await fetch(`${API_BASE}/servers/active/state`);
    const data = await res.json();
    return data.state;
  },

  async listTools(): Promise<ToolItem[]> {
    const res = await fetch(`${API_BASE}/servers/active/tools`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch tools' }));
      throw new Error(err.error || 'Failed to fetch tools');
    }
    const data = await res.json();
    return data.tools || [];
  },

  async callTool(name: string, args: Record<string, any>): Promise<any> {
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
    const res = await fetch(`${API_BASE}/servers/active/resources`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch resources' }));
      throw new Error(err.error || 'Failed to fetch resources');
    }
    return res.json();
  },

  async readResource(uri: string): Promise<any> {
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
    const res = await fetch(`${API_BASE}/servers/active/prompts`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch prompts' }));
      throw new Error(err.error || 'Failed to fetch prompts');
    }
    const data = await res.json();
    return data.prompts || [];
  },

  async getPrompt(name: string, args: Record<string, any>): Promise<any> {
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
    const res = await fetch(`${API_BASE}/logs?limit=${limit}`);
    const data = await res.json();
    return data.logs || [];
  },

  async clearLogs(): Promise<void> {
    await fetch(`${API_BASE}/logs`, { method: 'DELETE' });
  },

  async detectConfigs(): Promise<{ detected: any[] }> {
    const res = await fetch(`${API_BASE}/import/detect`);
    return res.json();
  },

  async importServers(servers: any[]): Promise<any> {
    const res = await fetch(`${API_BASE}/import/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servers })
    });
    return res.json();
  }
};
