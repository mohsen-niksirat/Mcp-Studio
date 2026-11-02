import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { MCPClientManager } from './mcp/client-manager.js';
import { ConfigImporter } from './mcp/config-importer.js';
import { createChatProxyRouter } from './chat/chat-proxy.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = Number(process.env.PORT) || 4999;

/**
 * The backend executes local processes and holds provider keys, so it must
 * not be readable from arbitrary websites: only the bundled UI origins
 * (Vite dev server, the production server itself, the desktop shell) are
 * allowed. Requests without an Origin header (curl, tests, the desktop
 * launcher) are same-authority clients and pass through.
 */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`
]);

function isAllowedOrigin(origin: string | undefined): boolean {
  return !origin || ALLOWED_ORIGINS.has(origin);
}

app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin))
  })
);
app.use(express.json({ limit: '10mb' }));

const clientManager = new MCPClientManager();

// WebSocket real-time event broadcasting
const clients = new Set<WebSocket>();

wss.on('connection', (ws, req) => {
  if (!isAllowedOrigin(req.headers.origin)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }
  clients.add(ws);

  // Send initial state & recent logs on connect
  ws.send(JSON.stringify({
    type: 'init',
    state: clientManager.getActiveStateForClient(),
    logs: clientManager.getLogs(50)
  }));

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', () => {
    // Socket failures (reset, write after close) must not crash the process.
    clients.delete(ws);
  });
});

wss.on('error', (err) => {
  console.error('[MCP-Studio Server] WebSocket server error:', err);
});

function broadcast(type: string, payload: any) {
  const message = JSON.stringify({ type, payload });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch {
        clients.delete(client);
      }
    }
  }
}

clientManager.on('state:changed', (state) => {
  broadcast('state:changed', clientManager.getActiveStateForClient());
});

clientManager.on('log', (log) => {
  broadcast('log', log);
});

clientManager.on('notification', (notif) => {
  broadcast('notification', notif);
});

clientManager.on('logs:cleared', () => {
  broadcast('logs:cleared', {});
});

clientManager.on('state:crashed', (payload) => {
  broadcast('state:crashed', {
    ...payload,
    config: { ...payload.config, env: redactEnv(payload.config.env) }
  });
});

/** Mirror of the backend redaction: env values never leave the process. */
function redactEnv(env?: Record<string, string>): Record<string, string> | undefined {
  if (!env) return env;
  return Object.fromEntries(Object.keys(env).map((key) => [key, '********']));
}

// Secure AI chat proxy: provider keys arrive in the request body and are
// forwarded server-side so they never appear in any URL.
app.use(createChatProxyRouter());

// REST Endpoints
app.get('/api/servers', (req, res) => {
  res.json({
    servers: clientManager.getServersForClient(),
    activeState: clientManager.getActiveStateForClient()
  });
});

const VALID_TRANSPORTS = new Set(['stdio', 'sse', 'streamable-http', 'mock']);

/**
 * Reject malformed server configs at the boundary so junk never reaches the
 * spawn/connect layer or the persisted store.
 */
function validateServerInput(
  input: any
): { name: string; transport: any; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> } | string {
  if (typeof input?.name !== 'string' || !input.name.trim()) {
    return 'name must be a non-empty string';
  }
  const transport = input.transport;
  if (typeof transport !== 'string' || !VALID_TRANSPORTS.has(transport)) {
    return `transport must be one of: ${Array.from(VALID_TRANSPORTS).join(', ')}`;
  }
  const isRecordOfStrings = (v: any) =>
    v === undefined ||
    (typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v) &&
      Object.values(v).every((x) => typeof x === 'string'));
  if (transport === 'stdio') {
    if (typeof input.command !== 'string' || !input.command.trim()) {
      return 'stdio transport requires a command';
    }
    if (input.args !== undefined && (!Array.isArray(input.args) || input.args.some((a: any) => typeof a !== 'string'))) {
      return 'args must be an array of strings';
    }
    if (!isRecordOfStrings(input.env)) {
      return 'env must be an object of string values';
    }
  }
  if (transport === 'sse' || transport === 'streamable-http') {
    if (typeof input.url !== 'string' || !/^https?:\/\//i.test(input.url)) {
      return `${transport} transport requires an http(s) url`;
    }
    if (!isRecordOfStrings(input.headers)) {
      return 'headers must be an object of string values';
    }
  }
  return {
    name: input.name,
    transport,
    command: input.command,
    args: input.args,
    env: input.env,
    url: input.url,
    headers: input.headers
  };
}

app.post('/api/servers', (req, res) => {
  try {
    const validated = validateServerInput(req.body);
    if (typeof validated === 'string') {
      return res.status(400).json({ error: validated });
    }
    const created = clientManager.addServer({
      ...validated,
      source: 'manual'
    });
    res.status(201).json({ ...created, env: redactEnv(created.env) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/servers/:id', (req, res) => {
  const success = clientManager.removeServer(req.params.id);
  res.json({ success });
});

app.post('/api/servers/:id/connect', async (req, res) => {
  try {
    const state = await clientManager.connect(req.params.id);
    res.json(clientManager.getActiveStateForClient());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/:id/reconnect', async (req, res) => {
  try {
    await clientManager.reconnect(req.params.id);
    res.json(clientManager.getActiveStateForClient());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/disconnect', async (req, res) => {
  try {
    await clientManager.disconnect();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/servers/active/state', (req, res) => {
  res.json({ state: clientManager.getActiveStateForClient() });
});

app.get('/api/servers/active/tools', async (req, res) => {
  try {
    const tools = await clientManager.listTools();
    res.json({ tools });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/active/tools/call', async (req, res) => {
  try {
    const { name, arguments: args } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Tool name is required' });
    }
    const result = await clientManager.callTool(name, args || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/servers/active/resources', async (req, res) => {
  try {
    const data = await clientManager.listResources();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/active/resources/read', async (req, res) => {
  try {
    const { uri } = req.body;
    if (!uri) {
      return res.status(400).json({ error: 'URI is required' });
    }
    const result = await clientManager.readResource(uri);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/servers/active/prompts', async (req, res) => {
  try {
    const prompts = await clientManager.listPrompts();
    res.json({ prompts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/active/prompts/get', async (req, res) => {
  try {
    const { name, arguments: args } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Prompt name is required' });
    }
    const result = await clientManager.getPrompt(name, args || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/active/benchmark', async (req, res) => {
  try {
    const iterations = Number(req.body.iterations) || 5;
    const stats = await clientManager.runBenchmark(iterations);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs', (req, res) => {
  const limit = Number(req.query.limit) || 100;
  // Optional server-side filters so long traffic histories do not have to be
  // shipped to the browser in full.
  const direction = req.query.direction as string | undefined;
  const method = (req.query.method as string | undefined)?.toLowerCase();
  const errorsOnly = req.query.errorsOnly === '1' || req.query.errorsOnly === 'true';

  let logs = clientManager.getLogs(limit);
  if (direction === 'incoming' || direction === 'outgoing') {
    logs = logs.filter((l) => l.direction === direction);
  }
  if (method) {
    logs = logs.filter((l) => (l.method || '').toLowerCase().includes(method));
  }
  if (errorsOnly) {
    logs = logs.filter((l) => l.isError);
  }
  res.json({ logs });
});

app.delete('/api/logs', (req, res) => {
  clientManager.clearLogs();
  res.json({ success: true });
});

app.get('/api/import/detect', (req, res) => {
  try {
    const detected = ConfigImporter.detectConfigs();
    res.json({ detected });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import/apply', (req, res) => {
  try {
    const { servers } = req.body;
    if (!Array.isArray(servers)) {
      return res.status(400).json({ error: 'servers array required' });
    }
    const imported: any[] = [];
    for (const s of servers) {
      const validated = validateServerInput(s);
      if (typeof validated === 'string') {
        return res.status(400).json({ error: `Invalid server "${s?.name ?? '?'}": ${validated}` });
      }
      const added = clientManager.addServer({
        ...validated,
        source: s.source || 'claude'
      });
      imported.push({ ...added, env: redactEnv(added.env) });
    }
    res.json({ importedCount: imported.length, imported });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend dist if built
const clientDistPath = path.resolve(process.cwd(), 'client', 'dist');
app.use(express.static(clientDistPath));
// Express 5 removed the '*' wildcard pattern (path-to-regexp v8); a
// catch-all middleware is the supported SPA fallback. API and WebSocket
// paths fall through untouched.
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return next();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('MCP-Studio API is running. Start the Vite dev server for client.');
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 [MCP-Studio Server] Listening on http://localhost:${PORT}`);
  console.log(`🔌 [MCP-Studio Server] WebSocket ready at ws://localhost:${PORT}`);
});
