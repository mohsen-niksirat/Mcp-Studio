import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
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
  timer?: NodeJS.Timeout;
}

const MCP_PROTOCOL_VERSION = '2024-11-05';

/** Default per-request JSON-RPC timeout in ms (override with MCP_RPC_TIMEOUT_MS). */
const DEFAULT_RPC_TIMEOUT_MS = 10_000;

export class MCPClientManager extends EventEmitter {
  private servers: Map<string, ServerConfig> = new Map();
  private activeId: string | null = null;
  private activeState: ServerState | null = null;
  private activeProcess: ChildProcess | null = null;
  private sseClient: Client | null = null;
  private remoteTransport: Transport | null = null;
  private mockServer: MockMCPServer = new MockMCPServer();
  private logs: JsonRpcMessageLog[] = [];
  private rpcIdCounter = 1;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private stdoutBuffer = '';
  private rpcTimeoutMs: number;
  private connectQueue: Promise<unknown> = Promise.resolve();

  constructor(options?: { rpcTimeoutMs?: number }) {
    super();
    const envTimeout = Number(process.env.MCP_RPC_TIMEOUT_MS);
    this.rpcTimeoutMs =
      options?.rpcTimeoutMs ??
      (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : DEFAULT_RPC_TIMEOUT_MS);
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

  /**
   * Serialize concurrent connect() calls: each one waits for the previous
   * connect/disconnect cycle to fully settle before touching shared state,
   * so parallel callers cannot orphan processes or interleave state changes.
   */
  private enqueueConnect<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.connectQueue.then(fn, fn);
    // Keep the queue alive even when a connect rejects.
    this.connectQueue = run.catch(() => undefined);
    return run;
  }

  async connect(id: string): Promise<ServerState> {
    return this.enqueueConnect(() => this.performConnect(id));
  }

  private async performConnect(id: string): Promise<ServerState> {
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

      if (config.transport === 'sse') {
        await this.connectSse(config);
        return this.activeState!;
      }

      if (config.transport === 'streamable-http') {
        await this.connectSse(config);
        return this.activeState!;
      }

      throw new Error(`Transport ${config.transport} is not supported.`);
    } catch (err: any) {
      // The connection never came up: release the slot so the next connect
      // is not blocked by a half-open session pointing at a dead target.
      this.activeId = null;
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
          this.activeProcess = null;
          this.activeState = {
            config,
            status: 'error',
            error: `Failed to spawn process: ${err.message}`
          };
          this.emit('state:changed', this.activeState);
          for (const [id, pending] of Array.from(this.pendingRequests.entries())) {
            this.pendingRequests.delete(id);
            if (pending.timer) clearTimeout(pending.timer);
            pending.reject(err);
          }
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

        // Writing to a child that just died raises EPIPE; the exit handler
        // owns the state transition, so just keep the process alive.
        proc.stdin?.on?.('error', (err: any) => {
          console.warn(`[MCP stdio stdin error]: ${err?.message || err}`);
        });

        proc.stdout?.on('data', (chunk: any) => {
          this.handleStdoutChunk(chunk.toString());
        });

        proc.on('exit', (code: any, signal: any) => {
          // Stale exit: this process was replaced or intentionally killed, so
          // disconnect()/connect() already own the state transition.
          if (this.activeProcess !== proc) {
            return;
          }
          console.log(`[MCP stdio exit]: code=${code}, signal=${signal}`);
          this.activeProcess = null;

          const message = `MCP server process exited unexpectedly (code ${code}, signal ${signal})`;
          this.activeState = {
            config,
            status: 'error',
            error: message
          };
          this.emit('state:changed', this.activeState);
          this.emit('state:crashed', {
            serverId: config.id,
            config,
            code,
            signal,
            error: message
          });

          // A dead process can never answer in-flight RPCs; fail them with the
          // crash reason so connect() surfaces the same message as the state.
          for (const [id, pending] of Array.from(this.pendingRequests.entries())) {
            this.pendingRequests.delete(id);
            if (pending.timer) clearTimeout(pending.timer);
            pending.reject(new Error(message));
          }
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

  /**
   * SSE (Server-Sent Events) transport via the official MCP TypeScript SDK.
   * The SDK handles endpoint negotiation, JSON-RPC framing, and request
   * timeouts; we translate its calls back into the same log/state events the
   * stdio path produces so the UI sees a uniform stream.
   */
  private async connectSse(config: ServerConfig): Promise<void> {
    if (!config.url) {
      throw new Error(
        `${config.transport} transport requires a url (e.g. http://localhost:8000/mcp)`
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(config.url);
      if (!/^https?:$/i.test(parsed.protocol)) {
        throw new Error('url must use http(s)');
      }
    } catch (e: any) {
      throw new Error(`Invalid ${config.transport} url: ${e?.message || config.url}`);
    }

    const headerEntries = Object.entries(config.headers || {});
    const headerInit =
      headerEntries.length > 0 ? { headers: Object.fromEntries(headerEntries) } : undefined;

    // Streamable HTTP is the modern transport; SSE is the legacy fallback.
    // Both share the same client wiring below — only the transport differs.
    const transport =
      config.transport === 'streamable-http'
        ? new StreamableHTTPClientTransport(parsed, { requestInit: headerInit })
        : new SSEClientTransport(parsed, { requestInit: headerInit });
    this.remoteTransport = transport;

    // Pipe transport-level frames into the protocol inspector. The SDK emits
    // parsed JSONRPCMessage objects; latency is attributed to the pending RPC
    // that matches the response id.
    transport.onmessage = (msg: any) => {
      const isError = Boolean(msg?.error);
      const rpcId = msg?.id;
      const pendingKey =
        rpcId !== undefined && rpcId !== null
          ? this.pendingKeyFor(rpcId)
          : undefined;
      const pending =
        pendingKey !== undefined ? this.pendingRequests.get(pendingKey) : undefined;

      if (pendingKey !== undefined && pending) {
        this.pendingRequests.delete(pendingKey);
        if (pending.timer) clearTimeout(pending.timer);
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
        return;
      }

      this.addLog({
        timestamp: Date.now(),
        direction: 'incoming',
        method: msg?.method || 'notification',
        rpcId,
        data: msg,
        isError
      });
      if (msg?.method) {
        this.emit('notification', msg);
      }
    };

    transport.onerror = (err: Error) => {
      this.addLog({
        timestamp: Date.now(),
        direction: 'incoming',
        method: 'transport:error',
        data: { error: err.message },
        isError: true
      });
    };

    transport.onclose = () => {
      // A closed transport while this SSE session is still the active one
      // means the remote side went away — surface it the same way a crashed
      // stdio process is surfaced.
      if (this.remoteTransport !== transport) return;
      this.sseClient = null;
      this.remoteTransport = null;
      const message = 'SSE connection closed by the remote server';
      this.activeState = {
        config,
        status: 'error',
        error: message
      };
      this.emit('state:changed', this.activeState);
      this.emit('state:crashed', {
        serverId: config.id,
        config,
        code: null,
        signal: null,
        error: message
      });
      for (const [id, pending] of Array.from(this.pendingRequests.entries())) {
        this.pendingRequests.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
        pending.reject(new Error(message));
      }
    };

    const client = new Client(
      { name: 'mcp-studio', version: '1.0.0' },
      { capabilities: { sampling: {}, roots: { listChanged: true } } }
    );
    this.sseClient = client;

    const start = Date.now();
    await client.connect(transport);
    const pingMs = Date.now() - start;

    const info = client.getServerVersion();
    this.activeState = {
      config,
      status: 'connected',
      serverInfo: {
        name: info?.name || config.name,
        version: info?.version || 'unknown',
        protocolVersion: MCP_PROTOCOL_VERSION
      },
      connectedAt: Date.now(),
      lastPingMs: pingMs
    };
    this.emit('state:changed', this.activeState);
  }

  /**
   * Send a JSON-RPC request over the active SSE session. Unlike stdio (where
   * we own the frame), the SDK owns request ids; we still log the outgoing
   * frame so the inspector shows both directions.
   */
  private sendSseRequest<T>(method: string, sdkCall: () => Promise<T>): Promise<T> {
    if (!this.sseClient) {
      return Promise.reject(new Error('No active SSE connection.'));
    }
    const rpcId = `sse-${this.rpcIdCounter++}`;
    const start = Date.now();
    this.addLog({
      timestamp: Date.now(),
      direction: 'outgoing',
      method,
      rpcId,
      data: { jsonrpc: '2.0', id: rpcId, method }
    });

    const pending = new Promise<T>((resolve, reject) => {
      const entry: PendingRequest = {
        resolve: (v: any) => resolve(v),
        reject,
        timestamp: start,
        method
      };
      entry.timer = setTimeout(() => {
        const key = this.pendingKeyFor(rpcId);
        if (this.pendingRequests.get(key) === entry) {
          this.pendingRequests.delete(key);
        }
        this.addLog({
          timestamp: Date.now(),
          direction: 'incoming',
          method,
          rpcId,
          data: { jsonrpc: '2.0', id: rpcId, error: { message: 'request timed out' } },
          isError: true
        });
        reject(
          new Error(
            `request timed out after ${this.rpcTimeoutMs}ms waiting for a ${method} response`
          )
        );
      }, this.rpcTimeoutMs);
      this.pendingRequests.set(this.pendingKeyFor(rpcId), entry);
    });

    // The SDK resolves with the unwrapped result; settle the pending map entry
    // ourselves and log the synthetic response frame.
    sdkCall()
      .then((res) => {
        const latencyMs = Date.now() - start;
        this.addLog({
          timestamp: Date.now(),
          direction: 'incoming',
          method,
          rpcId,
          data: { jsonrpc: '2.0', id: rpcId, result: res },
          latencyMs
        });
        const key = this.pendingKeyFor(rpcId);
        const p = this.pendingRequests.get(key);
        if (p) {
          this.pendingRequests.delete(key);
          if (p.timer) clearTimeout(p.timer);
          p.resolve(res);
        }
      })
      .catch((err) => {
        const latencyMs = Date.now() - start;
        this.addLog({
          timestamp: Date.now(),
          direction: 'incoming',
          method,
          rpcId,
          data: { jsonrpc: '2.0', id: rpcId, error: { message: err.message } },
          latencyMs,
          isError: true
        });
        const key = this.pendingKeyFor(rpcId);
        const p = this.pendingRequests.get(key);
        if (p) {
          this.pendingRequests.delete(key);
          if (p.timer) clearTimeout(p.timer);
          p.reject(err);
        }
      });

    return pending;
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

  /**
   * Canonical pending-request map key for a JSON-RPC id: string form, so a
   * string reply id still matches a numeric request id (and vice versa).
   */
  private pendingKeyFor(id: string | number): string {
    return String(id);
  }

  private handleIncomingRpc(msg: any) {
    const isError = Boolean(msg.error);
    const rpcId = msg.id;

    // JSON-RPC ids may come back as a string while we sent a number (or vice
    // versa); match on the canonical string form so replies are never lost.
    const pendingKey =
      rpcId !== undefined && rpcId !== null
        ? this.pendingKeyFor(rpcId)
        : undefined;
    const pending = pendingKey !== undefined ? this.pendingRequests.get(pendingKey) : undefined;

    if (pendingKey !== undefined && pending) {
      this.pendingRequests.delete(pendingKey);
      if (pending.timer) clearTimeout(pending.timer);
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

      const key = this.pendingKeyFor(id);
      const pending: PendingRequest = {
        resolve,
        reject,
        timestamp: Date.now(),
        method
      };

      // A silent stdio server must not hang the caller forever: arm a timer
      // that rejects and removes the pending entry when it fires.
      pending.timer = setTimeout(() => {
        if (this.pendingRequests.get(key) === pending) {
          this.pendingRequests.delete(key);
        }
        this.addLog({
          timestamp: Date.now(),
          direction: 'incoming',
          method,
          rpcId: id,
          data: { jsonrpc: '2.0', id, error: { message: 'request timed out' } },
          isError: true
        });
        reject(
          new Error(
            `request timed out after ${this.rpcTimeoutMs}ms waiting for a ${method} response`
          )
        );
      }, this.rpcTimeoutMs);

      this.pendingRequests.set(key, pending);

      if (this.activeProcess && this.activeProcess.stdin?.writable) {
        this.activeProcess.stdin.write(JSON.stringify(payload) + '\n');
      } else {
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingRequests.delete(key);
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
    // Null the handle first: the exit handler treats a missing active process
    // as a stale event and leaves the state transition to us.
    const proc = this.activeProcess;
    this.activeProcess = null;
    if (proc) {
      try {
        proc.kill('SIGTERM');
      } catch (e) {
        // ignore
      }
    }

    // Tear down any SSE session before failing pending requests.
    const sse = this.remoteTransport;
    this.sseClient = null;
    this.remoteTransport = null;
    if (sse) {
      try {
        await sse.close();
      } catch {
        // ignore transport teardown failures
      }
    }

    // Callers awaiting in-flight RPCs must not hang on a closed connection.
    for (const [id, pending] of Array.from(this.pendingRequests.entries())) {
      this.pendingRequests.delete(id);
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error('MCP server connection closed'));
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

  async reconnect(id: string): Promise<ServerState> {
    await this.disconnect();
    return this.connect(id);
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

    if (this.activeState.config.transport === 'sse') {
      const res = await this.sendSseRequest('tools/call', () =>
        this.sseClient!.callTool({ name, arguments: args })
      );
      return {
        ...(res as any),
        latencyMs: Date.now() - start
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

    if (this.activeState.config.transport === 'sse') {
      const [resList, tmplList] = await Promise.all([
        this.sendSseRequest<any>('resources/list', () =>
          this.sseClient!.listResources()
        ).catch(() => ({ resources: [] })),
        this.sendSseRequest<any>('resources/templates/list', () =>
          this.sseClient!.listResourceTemplates()
        ).catch(() => ({ resourceTemplates: [] }))
      ]);
      return {
        resources: resList?.resources || [],
        templates: tmplList?.resourceTemplates || []
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

    if (this.activeState.config.transport === 'sse') {
      const res = await this.sendSseRequest('resources/read', () =>
        this.sseClient!.readResource({ uri })
      );
      return {
        ...(res as any),
        latencyMs: Date.now() - start
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

    if (this.activeState.config.transport === 'sse') {
      const res = await this.sendSseRequest<any>('prompts/list', () =>
        this.sseClient!.listPrompts()
      );
      return res?.prompts || [];
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

    if (this.activeState.config.transport === 'sse') {
      const res = await this.sendSseRequest('prompts/get', () =>
        this.sseClient!.getPrompt({ name, arguments: args })
      );
      return {
        ...(res as any),
        latencyMs: Date.now() - start
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
