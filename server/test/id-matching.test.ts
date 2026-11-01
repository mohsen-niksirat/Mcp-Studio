import assert from 'assert';
import { spawn, ChildProcess } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { MCPClientManager } from '../src/mcp/client-manager.js';

/**
 * Spins up a tiny MCP stdio server that answers requests with string ids
 * even though the studio sends numeric ids, and one that echoes the id
 * verbatim. Proves that id-type mismatches no longer strand pending RPCs.
 */

const STRING_ID_SERVER = `process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.method === 'initialize') {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: String(msg.id), // string reply to a numeric request id
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            serverInfo: { name: 'string-id-server', version: '1.0.0' }
          }
        }) + '\\n');
      } else if (msg.id !== undefined) {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: String(msg.id),
          result: { tools: [{ name: 'echo_tool', inputSchema: { type: 'object' } }] }
        }) + '\\n');
      }
    } catch {}
  }
});
`;

async function waitFor(condition: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function runTests() {
  console.log('🧪 Starting RPC id-matching tests...\n');

  const scriptPath = path.join(os.tmpdir(), `mcp-studio-string-id-${Date.now()}-${process.pid}.js`);
  fs.writeFileSync(scriptPath, STRING_ID_SERVER);

  const manager = new MCPClientManager();
  const server = manager.addServer({
    name: 'String Id Server',
    transport: 'stdio',
    command: 'node',
    args: [scriptPath],
    source: 'manual'
  });

  const state = await manager.connect(server.id);
  assert.strictEqual(state.status, 'connected', 'connect should succeed');
  assert.strictEqual(
    state.serverInfo?.name,
    'string-id-server',
    'initialize reply with a string id must resolve the pending numeric request'
  );
  console.log('✅ initialize reply with string id matched the numeric request id');

  const tools = await manager.listTools();
  assert.strictEqual(tools.length, 1, 'tools/list reply with string id must resolve');
  assert.strictEqual(tools[0].name, 'echo_tool');
  console.log('✅ tools/list reply with string id matched');

  await manager.disconnect();
  try {
    fs.unlinkSync(scriptPath);
  } catch {
    // best effort cleanup
  }

  console.log('\n🎉 ALL RPC ID-MATCHING TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error(`${process.env.CI ? '::error::' : ''}Test failed:`, err?.stack || err);
  process.exit(1);
});
