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

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const clientManager = new MCPClientManager();

// WebSocket real-time event broadcasting
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);

  // Send initial state & recent logs on connect
  ws.send(JSON.stringify({
    type: 'init',
    state: clientManager.getActiveState(),
    logs: clientManager.getLogs(50)
  }));

  ws.on('close', () => {
    clients.delete(ws);
  });
});

function broadcast(type: string, payload: any) {
  const message = JSON.stringify({ type, payload });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

clientManager.on('state:changed', (state) => {
  broadcast('state:changed', state);
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
  broadcast('state:crashed', payload);
});

// Secure AI chat proxy: provider keys arrive in the request body and are
// forwarded server-side so they never appear in any URL.
app.use(createChatProxyRouter());

// REST Endpoints
app.get('/api/servers', (req, res) => {
  res.json({
    servers: clientManager.getServers(),
    activeState: clientManager.getActiveState()
  });
});

app.post('/api/servers', (req, res) => {
  try {
    const { name, transport, command, args, env, url, headers } = req.body;
    if (!name || !transport) {
      return res.status(400).json({ error: 'Name and transport are required' });
    }
    const created = clientManager.addServer({
      name,
      transport,
      command,
      args,
      env,
      url,
      headers,
      source: 'manual'
    });
    res.status(201).json(created);
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
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/:id/reconnect', async (req, res) => {
  try {
    const state = await clientManager.reconnect(req.params.id);
    res.json(state);
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
  res.json({ state: clientManager.getActiveState() });
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
  res.json({ logs: clientManager.getLogs(limit) });
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
      const added = clientManager.addServer({
        name: s.name,
        transport: s.transport,
        command: s.command,
        args: s.args,
        env: s.env,
        url: s.url,
        headers: s.headers,
        source: s.source || 'claude'
      });
      imported.push(added);
    }
    res.json({ importedCount: imported.length, imported });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend dist if built
const clientDistPath = path.resolve(process.cwd(), 'client', 'dist');
app.use(express.static(clientDistPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('MCP-Studio API is running. Start the Vite dev server for client.');
    }
  });
});

const PORT = process.env.PORT || 4999;
server.listen(PORT, () => {
  console.log(`🚀 [MCP-Studio Server] Listening on http://localhost:${PORT}`);
  console.log(`🔌 [MCP-Studio Server] WebSocket ready at ws://localhost:${PORT}`);
});
