import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  ServerConfig,
  ServerState,
  JsonRpcMessageLog,
  ToolItem,
  ResourceItem,
  ResourceTemplateItem,
  PromptItem,
  BenchmarkResult
} from '../types.js';
import { MockMCPServer } from './mock-server.js';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timestamp: number;
  method: string;
}

export class MCPClientManager extends EventEmitter {
  private servers: Map<string, ServerConfig> = new Map();
  private activeId: string | null = null;
  private activeState: ServerState | null = null;
  private activeProcess: ChildProcess | null = null;
  private mockServer: MockMCPServer = new MockMCPServer();
  private logs: JsonRpcMessageLog[] = [];
  private rpcIdCounter = 1;
  private pendingRequests: Map<string | number, PendingRequest> = new Map();
  private stdoutBuffer = '';

  constructor() {
    super();
    // Default built-in Demo Server
    const defaultMock: ServerConfig = {
      id: 'demo-mock-server',
      name: 'MCP-Studio Demo Server',
      transport: 'mock',
      isBuiltIn: true,
      createdAt: Date.now()
    };
    this.servers.set(defaultMock.id, defaultMock);
  }

  getServers(): ServerConfig[] {
    return Array.from(this.servers.values());
  }

  addServer(config: Omit<ServerConfig, 'id' | 'createdAt'>): ServerConfig {
    const id = `server-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newConfig: ServerConfig = {
      ...config,
      id,
      createdAt: Date.now()
    };
    this.servers.set(id, newConfig);
    return newConfig;
  }

  removeServer(id: string): boolean {
    if (this.activeId === id) {
      this.disconnect();
    }
    return this.servers.delete(id);
  }

  getActiveState(): ServerState | null {
    return this.activeState;
  }

  getLogs(limit = 100): JsonRpcMessageLog[] {
    return this.logs.slice(-limit);
  }

  clearLogs(): void {
    this.logs = [];
    this.emit('logs:cleared');
  }

  private addLog(log: Omit<JsonRpcMessageLog, 'id'>): JsonRpcMessageLog {
    const entry: JsonRpcMessageLog = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
    };
    this.logs.push(entry);
    if (this.logs.length > 500) {
      this.logs.shift();
    }
    this.emit('log', entry);
    return entry;
  }

  async connect(id: string): Promise<ServerState> {
    const config = this.servers.get(id);
    if (!config) {
      throw new Error(`Server configuration not found for id: ${id}`);
    }

    if (this.activeId) {
      await this.disconnect();
    }

    this.activeId = id;
    this.activeState = {
      config,
      status: 'connecting'
    };
    this.emit('state:changed', this.activeState);

    try {
      if (config.transport === 'mock') {
        this.activeState = {
          config,
          status: 'connected',
          serverInfo: {
            name: this.mockServer.name,
            version: this.mockServer.version,
            protocolVersion: this.mockServer.protocolVersion
          },
          connectedAt: Date.now()
        };
        this.emit('state:changed', this.activeState);
        return this.activeState;
      }

      if (config.transport === 'stdio') {
        await this.connectStdio(config);
        return this.activeState!;
      }

      throw new Error(`Transport ${config.transport} is not yet supported in this version.`);
    } catch (err: any) {
      this.activeState = {
        config,
        status: 'error',
        error: err.message || String(err)
      };
      this.emit('state:changed', this.activeState);
      throw err;
    }
  }

  private async connectStdio(config: ServerConfig): Promise<void> {
    if (!config.command) {
      throw new Error('stdio transport requires a command (e.g. npx, node, python)');
    }

    return new Promise((resolve, reject) => {
      try {
        const env = {
          ...process.env,
          ...(config.env || {})
        };

        const cmd = config.command!;
        const proc: any = spawn(cmd, config.args || [], {
          env,
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        this.activeProcess = proc;
        this.stdoutBuffer = '';

        proc.on('error', (err: any) => {
          this.activeState = {
            config,
            status: 'error',
            error: `Failed to spawn process: ${err.message}`
          };
          this.emit('state:changed', this.activeState);
          reject(err);
        });

        proc.stderr?.on('data', (chunk: any) => {
          const text = chunk.toString();
          console.warn(`[MCP stdio stderr]: ${text}`);
          this.addLog({
            timestamp: Date.now(),
            direction: 'incoming',
            method: 'stderr',
            data: { error: text },
            isError: true
          });
        });

        proc.stdout?.on('data', (chunk: any) => {
          this.handleStdoutChunk(chunk.toString());
        });

        proc.on('exit', (code: any, signal: any) => {
          console.log(`[MCP stdio exit]: code=${code}, signal=${signal}`);
          this.activeState = {
            config,
            status: 'disconnected',
            error: code !== 0 ? `Process exited with code ${code}` : undefined
          };
          this.activeProcess = null;
          this.emit('state:changed', this.activeState);
        });

        // Send MCP initialize request
        this.sendJsonRpcRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {
            sampling: {},
            roots: { listChanged: true }
          },
          clientInfo: {
            name: 'mcp-studio',
            version: '1.0.0'
          }
        })
          .then((initResult: any) => {
            // Send initialized notification
            this.sendJsonRpcNotification('notifications/initialized');

            this.activeState = {
              config,
              status: 'connected',
              serverInfo: {
                name: initResult?.serverInfo?.name || config.name,
                version: initResult?.serverInfo?.version || 'unknown',
                protocolVersion: initResult?.protocolVersion
              },
              connectedAt: Date.now()
            };
            this.emit('state:changed', this.activeState);
            resolve();
          })
          .catch((err) => {
            reject(err);
          });
      } catch (e) {
        reject(e);
      }
    });
  }

  private handleStdoutChunk(chunk: string) {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        this.handleIncomingRpc(msg);
      } catch (e) {
        // Not a JSON-RPC line (maybe server logged raw text)
        console.log(`[MCP Server stdout text]: ${trimmed}`);
      }
    }
  }

  private handleIncomingRpc(msg: any) {
    const isError = Boolean(msg.error);
    const rpcId = msg.id;

    if (rpcId !== undefined && this.pendingRequests.has(rpcId)) {
      const pending = this.pendingRequests.get(rpcId)!;
      this.pendingRequests.delete(rpcId);
      const latencyMs = Date.now() - pending.timestamp;

      this.addLog({
        timestamp: Date.now(),
        direction: 'incoming',
        method: pending.method,
        rpcId,
        data: msg,
        latencyMs,
        isError
      });

      if (isError) {
        pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      } else {
        pending.resolve(msg.result);
      }
    } else {
      // Notification or unsolicited response
      this.addLog({
        timestamp: Date.now(),
        direction: 'incoming',
        method: msg.method || 'notification',
        rpcId,
        data: msg,
        isError
      });
      if (msg.method) {
        this.emit('notification', msg);
      }
    }
  }

  private sendJsonRpcRequest(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.rpcIdCounter++;
      const payload = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.addLog({
        timestamp: Date.now(),
        direction: 'outgoing',
        method,
        rpcId: id,
        data: payload
      });

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timestamp: Date.now(),
        method
      });

      if (this.activeProcess && this.activeProcess.stdin?.writable) {
        this.activeProcess.stdin.write(JSON.stringify(payload) + '\n');
      } else {
        this.pendingRequests.delete(id);
        reject(new Error('No active stdio process writable stream available.'));
      }
    });
  }

  private sendJsonRpcNotification(method: string, params: any = {}): void {
    const payload = {
      jsonrpc: '2.0',
      method,
      params
    };

    this.addLog({
      timestamp: Date.now(),
      direction: 'outgoing',
      method,
      data: payload
    });

    if (this.activeProcess && this.activeProcess.stdin?.writable) {
      this.activeProcess.stdin.write(JSON.stringify(payload) + '\n');
    }
  }

  async disconnect(): Promise<void> {
    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGTERM');
      } catch (e) {
        // ignore
      }
      this.activeProcess = null;
    }

    if (this.activeState) {
      this.activeState = {
        config: this.activeState.config,
        status: 'disconnected'
      };
      this.emit('state:changed', this.activeState);
    }
    this.activeId = null;
  }

  // MCP Operations
  async listTools(): Promise<ToolItem[]> {
    if (!this.activeState || this.activeState.status !== 'connected') {
      throw new Error('Not connected to any MCP server');
    }

    if (this.activeState.config.transport === 'mock') {
      return this.mockServer.getTools();
    }

    const res = await this.sendJsonRpcRequest('tools/list', {});
    return res?.tools || [];
  }

  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    if (!this.activeState || this.activeState.status !== 'connected') {
      throw new Error('Not connected to any MCP server');
    }

    const start = Date.now();
    if (this.activeState.config.transport === 'mock') {
      this.addLog({
        timestamp: start,
        direction: 'outgoing',
        method: 'tools/call',
        data: { name, arguments: args }
      });

      const res = await this.mockServer.callTool(name, args);
      const latencyMs = Date.now() - start;

      this.addLog({
        timestamp: Date.now(),
        direction: 'incoming',
        method: 'tools/call',
        data: res,
        latencyMs
      });

      return {
        ...res,
        latencyMs
      };
    }

    const res = await this.sendJsonRpcRequest('tools/call', {
      name,
      arguments: args
    });
    return {
      ...res,
      latencyMs: Date.now() - start
    };
  }

  async listResources(): Promise<{ resources: ResourceItem[]; templates: ResourceTemplateItem[] }> {
    if (!this.activeState || this.activeState.status !== 'connected') {
      throw new Error('Not connected to any MCP server');
    }

    if (this.activeState.config.transport === 'mock') {
      return {
        resources: this.mockServer.getResources(),
        templates: this.mockServer.getResourceTemplates()
      };
    }

    const [resList, tmplList] = await Promise.all([
      this.sendJsonRpcRequest('resources/list', {}).catch(() => ({ resources: [] })),
      this.sendJsonRpcRequest('resources/templates/list', {}).catch(() => ({ resourceTemplates: [] }))
    ]);

    return {
      resources: resList?.resources || [],
      templates: tmplList?.resourceTemplates || []
    };
  }

  async readResource(uri: string): Promise<any> {
    if (!this.activeState || this.activeState.status !== 'connected') {
      throw new Error('Not connected to any MCP server');
    }

    const start = Date.now();
    if (this.activeState.config.transport === 'mock') {
      this.addLog({
        timestamp: start,
        direction: 'outgoing',
        method: 'resources/read',
        data: { uri }
      });

      const res = await this.mockServer.readResource(uri);
      const latencyMs = Date.now() - start;

      this.addLog({
        timestamp: Date.now(),
        direction: 'incoming',
        method: 'resources/read',
        data: res,
        latencyMs
      });

      return {
        ...res,
        latencyMs
      };
    }

    const res = await this.sendJsonRpcRequest('resources/read', { uri });
    return {
      ...res,
      latencyMs: Date.now() - start
    };
  }

  async listPrompts(): Promise<PromptItem[]> {
    if (!this.activeState || this.activeState.status !== 'connected') {
      throw new Error('Not connected to any MCP server');
    }

    if (this.activeState.config.transport === 'mock') {
      return this.mockServer.getPrompts();
    }

    const res = await this.sendJsonRpcRequest('prompts/list', {});
    return res?.prompts || [];
  }

  async getPrompt(name: string, args: Record<string, any> = {}): Promise<any> {
    if (!this.activeState || this.activeState.status !== 'connected') {
      throw new Error('Not connected to any MCP server');
    }

    const start = Date.now();
    if (this.activeState.config.transport === 'mock') {
      this.addLog({
        timestamp: start,
        direction: 'outgoing',
        method: 'prompts/get',
        data: { name, arguments: args }
      });

      const res = await this.mockServer.getPrompt(name, args);
      const latencyMs = Date.now() - start;

      this.addLog({
        timestamp: Date.now(),
        direction: 'incoming',
        method: 'prompts/get',
        data: res,
        latencyMs
      });

      return {
        ...res,
        latencyMs
      };
    }

    const res = await this.sendJsonRpcRequest('prompts/get', {
      name,
      arguments: args
    });
    return {
      ...res,
      latencyMs: Date.now() - start
    };
  }

  async runBenchmark(iterations = 5): Promise<{
    iterations: number;
    avgLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    successRate: number;
    results: BenchmarkResult[];
  }> {
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      try {
        await this.listTools();
        results.push({
          toolName: 'tools/list (health ping)',
          latencyMs: Date.now() - start,
          success: true,
          timestamp: Date.now()
        });
      } catch (err: any) {
        results.push({
          toolName: 'tools/list (health ping)',
          latencyMs: Date.now() - start,
          success: false,
          error: err.message,
          timestamp: Date.now()
        });
      }
    }

    const latencies = results.map((r) => r.latencyMs);
    const successCount = results.filter((r) => r.success).length;

    return {
      iterations,
      avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      successRate: Math.round((successCount / iterations) * 100),
      results
    };
  }
}
