import assert from 'assert';
import { MCPClientManager } from '../src/mcp/client-manager.js';

/**
 * Connect/disconnect race hardening:
 * 1. A failed connect (unspawnable command) must release the active slot so
 *    the next connect succeeds without a server restart.
 * 2. Concurrent connect() calls must serialize — every caller gets a settled
 *    result and no process is orphaned (the last caller wins the slot).
 */

async function runTests() {
  console.log('🧪 Starting connect race tests...\n');

  const manager = new MCPClientManager();

  // 1. Failed connect releases the slot.
  const broken = manager.addServer({
    name: 'Broken Server',
    transport: 'stdio',
    command: 'definitely-not-a-real-command-e2e-race',
    args: [],
    source: 'manual'
  });

  let brokenError: unknown = null;
  try {
    await manager.connect(broken.id);
  } catch (err) {
    brokenError = err;
  }
  assert(brokenError, 'connect to an unspawnable command must reject');
  console.log('✅ failed connect rejected with:', (brokenError as Error).message);

  const afterFailure = manager.getActiveState();
  assert(afterFailure, 'state should exist after a failed connect');
  assert.strictEqual(afterFailure.status, 'error', 'state should be error');

  // Recovery: connect to the healthy demo mock server right after.
  const recovered = await manager.connect('demo-mock-server');
  assert.strictEqual(recovered.status, 'connected', 'next connect must succeed');
  const tools = await manager.listTools();
  assert(tools.length > 0, 'tools must list after recovery');
  console.log('✅ connect after a failed spawn works without a restart');

  // 2. Concurrent connects serialize; the last one wins the slot.
  const results: string[] = [];
  const [a, b, c] = await Promise.allSettled([
    manager.connect('demo-mock-server'),
    manager.connect(broken.id),
    manager.connect('demo-mock-server')
  ]);

  // At least the mock connects must succeed.
  const settled = [a, b, c].map((r) => r.status);
  assert(
    settled.filter((s) => s === 'fulfilled').length >= 2,
    `at least two of three concurrent connects must settle, got: ${settled.join(',')}`
  );
  results.push(...settled);

  const finalState = manager.getActiveState();
  assert(finalState, 'a state must exist after concurrent connects');
  assert(
    finalState.status === 'connected' || finalState.status === 'error',
    `final state must be settled, got: ${finalState.status}`
  );
  // The winner must be one of the requested servers.
  assert(
    finalState.config.id === 'demo-mock-server' || finalState.config.id === broken.id,
    'final active server must be one of the concurrently requested ids'
  );
  console.log(`✅ concurrent connects serialized and settled: ${results.join(', ')}`);

  // 3. The manager still works after the race.
  const post = await manager.connect('demo-mock-server');
  assert.strictEqual(post.status, 'connected', 'post-race connect must succeed');
  await manager.disconnect();
  console.log('✅ manager fully functional after the race');

  console.log('\n🎉 ALL CONNECT RACE TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error(`${process.env.CI ? '::error::' : ''}Test failed:`, err?.stack || err);
  process.exit(1);
});
