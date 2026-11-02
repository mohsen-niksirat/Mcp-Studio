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
import { ServerStore } from './server-store.js';

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

/** Cap for the remote (SSE / streamable-http) handshake so a silent endpoint
 *  cannot wedge the serialized connect queue forever. */
const REMOTE_CONNECT_TIMEOUT_MS = 15_000;

/** NUL bytes cannot travel through exec argv and only make sense as an
 *  injection attempt. */
function assertSafeArg(arg: string): void {
  if (arg.includes('\0')) {
    throw new Error('Server arguments must not contain NUL bytes');
  }
}

/** POSIX shell single-quote: makes every character literal, including spaces
 *  and metacharacters. */
function posixQuoteArg(arg: string): string {
  assertSafeArg(arg);
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * cmd.exe (the shell Node uses with `shell: true` on Windows) parses quotes
 * by naive toggling, so an embedded double quote can break out of the quoted
 * region and inject shell metacharacters. Arguments containing double quotes
 * or line breaks are therefore rejected; everything else that cmd would
 * treat specially (spaces, & | < > ^) is made literal by double-quoting.
 */
function windowsQuoteArg(arg: string): string {
  assertSafeArg(arg);
  if (/["\r\n]/.test(arg)) {
    throw new Error(
      'Server arguments must not contain double quotes or line breaks on Windows'
    );
  }
  if (arg === '' || /[\s"&|<>^]/.test(arg)) {
    return `"${arg}"`;
  }
  return arg;
}

/**
 * Quote stdio arguments for execution through a shell. `shell: true` is
 * required on Windows so `npx`, `uvx`, ... resolve to their .cmd shims, and
 * it also keeps multi-word commands ("npx -y pkg") working on POSIX; quoting
 * keeps every argument byte-literal for the real child process.
 */
function quoteArgsForShell(args: string[]): string[] {
  const quote = process.platform === 'win32' ? windowsQuoteArg : posixQuoteArg;
  return args.map(quote);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Values that must never leave the backend (imported tokens, secrets). */
const REDACTED = '********';

function redactRecord(obj?: Record<string, string>): Record<string, string> | undefined {
  if (!obj) return obj;
  return Object.fromEntries(Object.keys(obj).map((key) => [key, REDACTED]));
}

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
  private store: ServerStore | null;

  constructor(options?: { rpcTimeoutMs?: number; store?: ServerStore | null }) {
    super();
    const envTimeout = Number(process.env.MCP_RPC_TIMEOUT_MS);
    this.rpcTimeoutMs =
      options?.rpcTimeoutMs ??
      (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : DEFAULT_RPC_TIMEOUT_MS);
    // Optional persistence: pass a store (or MCP_STUDIO_DISABLE_PERSISTENCE=1
    // in tests) to keep registered servers across backend restarts.
    this.store =
      options?.store !== undefined
        ? options.store
        : /^(1|true|yes)$/i.test(process.env.MCP_STUDIO_DISABLE_PERSISTENCE || '')
        ? null
        : new ServerStore();
    // Default built-in Demo Server
    const defaultMock: ServerConfig = {
      id: 'demo-mock-server',
      name: 'MCP-Studio Demo Server',
      transport: 'mock',
      isBuiltIn: true,
      createdAt: Date.now()
    };
    this.servers.set(defaultMock.id, defaultMock);
    this.loadPersistedServers();
  }

  private loadPersistedServers(): void {
    if (!this.store) return;
    for (const config of this.store.load()) {
      if (config.id === 'demo-mock-server') continue; // built-in always wins
      this.servers.set(config.id, config);
    }
  }

  private persistServers(): void {
    if (!this.store) return;
    try {
      this.store.save(Array.from(this.servers.values()));
    } catch (err) {
      console.warn('[MCPClientManager] Failed to persist servers:', err);
    }
  }

  getServers(): ServerConfig[] {
    return Array.from(this.servers.values());
  }

  /** Client-facing server list: env values are redacted (the client never
   *  needs them; they only exist for the backend spawn). */
  getServersForClient(): ServerConfig[] {
    return this.getServers().map((config) => ({
      ...config,
      env: redactRecord(config.env)
    }));
  }

  /** Client-facing active state: same redaction as getServersForClient. */
  getActiveStateForClient(): ServerState | null {
    if (!this.activeState) return null;
    return {
      ...this.activeState,
      config: { ...this.activeState.config, env: redactRecord(this.activeState.config.env) }
    };
  }

  addServer(config: Omit<ServerConfig, 'id' | 'createdAt'>): ServerConfig {
    const id = `server-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newConfig: ServerConfig = {
      ...config,
      id,
      createdAt: Date.now()
    };
    this.servers.set(id, newConfig);
    this.persistServers();
    return newConfig;
  }

  removeServer(id: string): boolean {
    if (this.activeId === id) {
      // Serialize the teardown with any in-flight connect so we never kill a
      // process mid-handshake; the map entry is removed immediately, so a
      // queued connect for this id will fail with "configuration not found".
      void this.enqueueConnect(async () => {
        await this.disconnect();
      });
    }
    const removed = this.servers.delete(id);
    if (removed) {
      this.persistServers();
    }
    return removed;
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

  /** Max automatic reconnect attempts after a crash. */
  private static readonly MAX_CRASH_RETRIES = 3;
  /** Upper bound for a single backoff delay. */
  private static readonly MAX_CRASH_BACKOFF_MS = 30_000;
  private crashRetryTimer: NodeJS.Timeout | null = null;
  private crashRetryAttempt = 0;

  /**
   * Schedule an automatic reconnect after a crash with exponential backoff
   * (1s, 2s, 4s, ... capped at 30s). Gives up after MAX_CRASH_RETRIES and
   * publishes the retry progress in the active state. Applies to both stdio
   * crashes and remote (SSE / streamable-http) connection drops.
   */
  private scheduleCrashRetry(config: ServerConfig): void {
    if (this.crashRetryAttempt >= MCPClientManager.MAX_CRASH_RETRIES) {
      this.crashRetryAttempt = 0;
      this.emit('notification', {
        method: 'studio/retry-exhausted',
        params: { serverId: config.id, message: 'Automatic reconnect gave up after 3 attempts' }
      });
      return;
    }

    this.crashRetryAttempt += 1;
    const delayMs = Math.min(
      1000 * Math.pow(2, this.crashRetryAttempt - 1),
      MCPClientManager.MAX_CRASH_BACKOFF_MS
    );

    if (this.activeState) {
      this.activeState = {
        ...this.activeState,
        status: 'connecting',
        error: `Reconnecting after crash (attempt ${this.crashRetryAttempt}/${MCPClientManager.MAX_CRASH_RETRIES})...`
      };
      this.emit('state:changed', this.activeState);
    }

    if (this.crashRetryTimer) clearTimeout(this.crashRetryTimer);
    this.crashRetryTimer = setTimeout(async () => {
      this.crashRetryTimer = null;
      // If the user actively switched to another server, never steal the
      // active slot back. A null activeId is the normal post-crash state
      // (the failed connect released the slot) and must still retry.
      if (this.activeId !== null && this.activeId !== config.id) {
        this.crashRetryAttempt = 0;
        return;
      }
      try {
        await this.connect(config.id);
        this.crashRetryAttempt = 0;
      } catch {
        // connect() already published the error state; the next crash (or
        // failure) re-enters scheduleCrashRetry through the exit handler.
      }
    }, delayMs);
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
        this.crashRetryAttempt = 0;
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
        this.crashRetryAttempt = 0;
        return this.activeState!;
      }

      if (config.transport === 'sse') {
        await this.connectSse(config);
        this.crashRetryAttempt = 0;
        return this.activeState!;
      }

      if (config.transport === 'streamable-http') {
        await this.connectSse(config);
        this.crashRetryAttempt = 0;
        return this.activeState!;
      }

      throw new Error(`Transport ${config.transport} is not supported.`);
    } catch (err: any) {
      // The connection never came up: release the slot so the next connect
      // is not blocked by a half-open session pointing at a dead target.
      // A stdio child spawned before the failure must be killed now — an
      // orphaned process would leak pipes and, when it eventually exits,
      // hijack the active state via its exit handler.
      const orphan = this.activeProcess;
      this.activeProcess = null;
      if (orphan) {
        try {
          if (process.platform === 'win32' && orphan.pid) {
            spawn('taskkill', ['/pid', String(orphan.pid), '/T', '/F'], {
              stdio: 'ignore'
            });
          } else {
            orphan.kill('SIGTERM');
          }
        } catch {
          // ignore
        }
      }
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
        let proc: any;
        try {
          proc = spawn(cmd, quoteArgsForShell(config.args || []), {
            env,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
          });
        } catch (spawnErr) {
          // quoteArgsForShell rejects injection-shaped arguments before any
          // process is created.
          reject(spawnErr);
          return;
        }

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

          // Automatic crash recovery: retry with exponential backoff, at most
          // MAX_CRASH_RETRIES times. Each attempt is published in the state so
          // the UI can show "reconnecting (attempt 2/3)".
          this.scheduleCrashRetry(config);
        });

        // Send MCP initialize request
        this.sendJsonRpcRequest('initialize', {
          protocolVersion: MCP_PROTOCOL_VERSION,
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
    // requestInit headers apply to the POSTs AND to the initial SSE GET
    // (the SDK routes the EventSource stream through a fetch override that
    // merges _commonHeaders), so auth-protected endpoints handshake fine.
    const transport =
      config.transport === 'streamable-http'
        ? new StreamableHTTPClientTransport(parsed, { requestInit: headerInit })
        : new SSEClientTransport(parsed, { requestInit: headerInit });
    this.remoteTransport = transport;

    // Pipe transport-level frames into the protocol inspector. The SDK emits
    // parsed JSONRPCMessage objects; latency is attributed to the pending RPC
    // that matches the response id.
    transport.onmessage = (msg: any) => {
      // Response frames are logged by sendSseRequest with proper latency
      // attribution; logging them here too would duplicate every entry in
      // the protocol inspector. Only forward requests/notifications.
      const isResponse =
        msg && msg.method === undefined && (msg.result !== undefined || msg.error !== undefined);
      if (isResponse) {
        return;
      }

      const isError = Boolean(msg?.error);
      const rpcId = msg?.id;

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
      // Remote drops get the same automatic recovery as stdio crashes.
      this.scheduleCrashRetry(config);
    };

    const client = new Client(
      { name: 'mcp-studio', version: '1.0.0' },
      { capabilities: { sampling: {}, roots: { listChanged: true } } }
    );
    this.sseClient = client;

    const start = Date.now();
    try {
      // A remote endpoint that never completes negotiation must not wedge
      // the serialized connect queue forever.
      await withTimeout(
        client.connect(transport),
        REMOTE_CONNECT_TIMEOUT_MS,
        `${config.transport} connect timed out after ${REMOTE_CONNECT_TIMEOUT_MS}ms`
      );
    } catch (err) {
      // Drop the half-open session so later connects are not blocked by it.
      // Null the handles first so transport.onclose treats this as stale.
      this.sseClient = null;
      this.remoteTransport = null;
      try {
        await transport.close();
      } catch {
        // ignore teardown failures
      }
      throw err;
    }
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
    // A manual disconnect cancels any pending automatic crash retry.
    if (this.crashRetryTimer) {
      clearTimeout(this.crashRetryTimer);
      this.crashRetryTimer = null;
    }
    this.crashRetryAttempt = 0;
    // Null the handle first: the exit handler treats a missing active process
    // as a stale event and leaves the state transition to us.
    const proc = this.activeProcess;
    this.activeProcess = null;
    if (proc) {
      try {
        // Close the pipe first: well-behaved MCP servers exit when stdin
        // closes, which is the cleanest teardown path on every platform.
        proc.stdin?.end();
      } catch {
        // ignore
      }
      try {
        if (process.platform === 'win32' && proc.pid) {
          // shell:true spawns cmd.exe wrapping the real server; killing the
          // shell alone orphans the child (it keeps running and can keep the
          // parent's event loop alive). taskkill /T takes down the tree.
          spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
            stdio: 'ignore'
          });
        } else {
          proc.kill('SIGTERM');
        }
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
    return this.enqueueConnect(async () => {
      await this.disconnect();
      return this.performConnect(id);
    });
  }

  // MCP Operations
  async listTools(): Promise<ToolItem[]> {
    if (!this.activeState || this.activeState.status !== 'connected') {
      throw new Error('Not connected to any MCP server');
    }

    if (this.activeState.config.transport === 'mock') {
      return this.mockServer.getTools();
    }

    // Remote sessions (SSE / streamable-http) are served by the SDK client;
    // the raw JSON-RPC path below only works for stdio processes.
    if (this.sseClient) {
      const res = await this.sendSseRequest<any>('tools/list', () =>
        this.sseClient!.listTools()
      );
      return res?.tools || [];
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

    if (this.sseClient) {
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

    if (this.sseClient) {
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

    if (this.sseClient) {
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

    if (this.sseClient) {
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

    if (this.sseClient) {
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
    // Clamp to a sane range: 0/negative/NaN would produce NaN averages and
    // division by zero, and absurd values would hammer the server.
    const safeIterations = Math.min(Math.max(Math.floor(Number(iterations) || 0), 1), 100);
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < safeIterations; i++) {
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
      iterations: safeIterations,
      avgLatencyMs: latencies.length
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
      minLatencyMs: latencies.length ? Math.min(...latencies) : 0,
      maxLatencyMs: latencies.length ? Math.max(...latencies) : 0,
      successRate: safeIterations ? Math.round((successCount / safeIterations) * 100) : 0,
      results
    };
  }
}
