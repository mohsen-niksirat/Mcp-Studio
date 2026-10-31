import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { MCPClientManager } from '../src/mcp/client-manager.js';

/**
 * A stdio MCP server that accepts the initialize request but never answers.
 * connect() must fail fast with a "request timed out" error instead of
 * hanging forever, and the manager must be usable again afterwards.
 */

const SILENT_SERVER = `process.stdin.setEncoding('utf8');
process.stdin.on('data', () => {
  // Swallow everything; never reply.
});
setInterval(() => {}, 1000); // stay alive
`;

async function runTests() {
  console.log('🧪 Starting RPC timeout tests...\n');

  const scriptPath = path.join(os.tmpdir(), `mcp-studio-silent-${Date.now()}-${process.pid}.js`);
  fs.writeFileSync(scriptPath, SILENT_SERVER);

  const manager = new MCPClientManager({ rpcTimeoutMs: 500 });
  const server = manager.addServer({
    name: 'Silent Server',
    transport: 'stdio',
    command: 'node',
    args: [scriptPath],
    source: 'manual'
  });

  const start = Date.now();
  let connectError: unknown = null;
  try {
    await manager.connect(server.id);
  } catch (err) {
    connectError = err;
  }

  const elapsed = Date.now() - start;
  assert(connectError, 'connect() must reject when initialize never answers');
  assert(
    /timed out/i.test(String((connectError as Error).message)),
    `error must mention the timeout, got: ${(connectError as Error).message}`
  );
  assert(
    elapsed < 5_000,
    `connect() must fail fast, took ${elapsed}ms`
  );
  console.log(`✅ silent initialize rejected after ${elapsed}ms with: ${(connectError as Error).message}`);

  const state = manager.getActiveState();
  assert(state, 'state should exist after the failed connect');
  assert.strictEqual(state.status, 'error', 'state should be error');
  console.log('✅ state marked as error after the timeout');

  // The manager must remain usable: connecting to the healthy demo mock
  // server right after the timeout must work without a restart.
  const demo = await manager.connect('demo-mock-server');
  assert.strictEqual(demo.status, 'connected', 'recovery connect should succeed');
  const tools = await manager.listTools();
  assert(tools.length > 0, 'tools must list after recovery');
  console.log('✅ manager recovered: demo mock server connected and listed tools');

  await manager.disconnect();
  try {
    fs.unlinkSync(scriptPath);
  } catch {
    // best effort cleanup
  }

  console.log('\n🎉 ALL RPC TIMEOUT TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error(`${process.env.CI ? '::error::' : ''}Test failed:`, err?.stack || err);
  process.exit(1);
});
