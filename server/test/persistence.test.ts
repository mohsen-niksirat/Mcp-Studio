import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MCPClientManager } from '../src/mcp/client-manager.js';
import { ServerStore } from '../src/mcp/server-store.js';

/**
 * Server config persistence: registering servers writes them atomically to
 * a store file, and a "restarted" manager (new instance, same store file)
 * reloads them. The built-in demo server always re-registers itself and
 * never duplicates.
 */

async function runTests() {
  console.log('🧪 Starting server persistence tests...\n');

  const storePath = path.join(os.tmpdir(), `mcp-studio-store-test-${process.pid}`, 'servers.json');
  const store = new ServerStore(storePath);

  // First "process": register two servers.
  const first = new MCPClientManager({ store });
  const added = first.addServer({
    name: 'Persisted FS Server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
    env: { FOO: 'bar' },
    source: 'manual'
  });
  first.addServer({
    name: 'Persisted SSE Server',
    transport: 'sse',
    url: 'http://localhost:8000/sse',
    headers: { Authorization: 'Bearer t' },
    source: 'manual'
  });

  assert(fs.existsSync(storePath), 'store file must exist after addServer');
  // Atomic write: no leftover tmp files.
  const dirEntries = fs.readdirSync(path.dirname(storePath));
  assert(
    dirEntries.every((f) => !f.endsWith('.tmp')),
    `atomic rename must leave no tmp files, saw: ${dirEntries.join(',')}`
  );
  console.log('✅ servers persisted atomically to', storePath);

  // Second "process": a fresh manager over the same store file.
  const second = new MCPClientManager({ store });
  const reloaded = second.getServers();

  const fsServer = reloaded.find((s) => s.id === added.id);
  assert(fsServer, 'registered stdio server must survive the restart');
  assert.strictEqual(fsServer.name, 'Persisted FS Server');
  assert.strictEqual(fsServer.env?.FOO, 'bar');
  const sseServer = reloaded.find((s) => s.name === 'Persisted SSE Server');
  assert(sseServer, 'registered sse server must survive the restart');
  assert.strictEqual(sseServer.headers?.Authorization, 'Bearer t');
  const demoCount = reloaded.filter((s) => s.id === 'demo-mock-server').length;
  assert.strictEqual(demoCount, 1, 'built-in demo server must never duplicate');
  console.log('✅ restart reloaded registered servers and kept the demo server single');

  // Removal persists too.
  second.removeServer(added.id);
  const third = new MCPClientManager({ store });
  assert(
    !third.getServers().some((s) => s.id === added.id),
    'removed server must stay removed after another restart'
  );
  console.log('✅ removal persists across restarts');

  // Corrupt store: load must not crash.
  fs.writeFileSync(storePath, '{not json', 'utf8');
  const resilient = new MCPClientManager({ store });
  assert(resilient.getServers().length >= 1, 'corrupt store must fall back to defaults');
  console.log('✅ corrupt store file is tolerated (fresh defaults)');

  // Cleanup.
  await third.disconnect();
  fs.rmSync(path.dirname(storePath), { recursive: true, force: true });

  console.log('\n🎉 ALL SERVER PERSISTENCE TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error(`${process.env.CI ? '::error::' : ''}Test failed:`, err?.stack || err);
  process.exit(1);
});
