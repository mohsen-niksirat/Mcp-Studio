import assert from 'assert';
import { unlinkSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { MCPClientManager } from '../src/mcp/client-manager.js';

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
  console.log('🧪 Starting Crash Resilience Tests...\n');

  const manager = new MCPClientManager();
  const crashed: any[] = [];
  manager.on('state:crashed', (payload) => crashed.push(payload));

  // stdio server that dies unexpectedly right after spawn. A file (instead of
  // `node -e`) avoids shell metacharacter pitfalls across platforms.
  const crashScript = path.join(os.tmpdir(), `mcp-studio-crash-${Date.now()}-${process.pid}.js`);
  writeFileSync(crashScript, 'process.exit(2);\n');

  const crashy = manager.addServer({
    name: 'Crashy Server',
    transport: 'stdio',
    command: 'node',
    args: [crashScript],
    source: 'manual'
  });

  let connectSettled = false;
  let connectError: unknown = null;
  manager
    .connect(crashy.id)
    .then(() => {
      connectSettled = true;
    })
    .catch((err) => {
      connectSettled = true;
      connectError = err;
    });

  await waitFor(() => crashed.length > 0, 5000, 'state:crashed event');
  await waitFor(() => connectSettled, 5000, 'connect() promise settlement');

  assert(connectError, 'connect() should reject when the spawned process dies during handshake');
  assert.strictEqual(crashed.length, 1, 'state:crashed should be emitted exactly once');
  assert.strictEqual(crashed[0].serverId, crashy.id, 'crash event should identify the server');
  assert(crashed[0].error, 'crash event should carry an error message');

  const state = manager.getActiveState();
  assert(state, 'active state should be present after a crash');
  assert.strictEqual(state!.status, 'error', 'state status should reflect the crash');
  assert(
    String(state!.error).includes('unexpectedly'),
    `state error should describe the unexpected exit, got: ${state!.error}`
  );
  console.log('✅ Unexpected stdio exit emits state:crashed and marks the state as error');

  // reconnect() must be able to recover onto a healthy server afterwards
  const reconnected = await manager.reconnect('demo-mock-server');
  assert.strictEqual(reconnected.status, 'connected', 'reconnect should end up connected');
  console.log('✅ reconnect() restores a working connection after a crash');

  await manager.disconnect();
  try {
    unlinkSync(crashScript);
  } catch {
    // best effort cleanup
  }
  console.log('\n🎉 ALL CRASH RESILIENCE TESTS PASSED!\n');
}

runTests().catch((err) => {
  // GitHub Actions turns "::error::" lines into public annotations.
  console.error(`${process.env.CI ? '::error::' : ''}Test failed:`, err?.stack || err);
  process.exit(1);
});
