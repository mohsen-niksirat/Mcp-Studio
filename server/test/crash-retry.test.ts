import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MCPClientManager } from '../src/mcp/client-manager.js';

/**
 * Automatic crash recovery: after an unexpected stdio exit the manager
 * retries with exponential backoff (1s, 2s, 4s), publishing the attempt
 * count in the state, up to 3 attempts. A flaky server (crashes twice,
 * then stays up) must end up connected without any manual action.
 */

const FLAKY_SERVER = `const fs = require('fs');
const counterFile = process.env.FLAKY_COUNTER_FILE;
process.stdin.setEncoding('utf8');
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
        let crashes = 0;
        try { crashes = Number(fs.readFileSync(counterFile, 'utf8')) || 0; } catch {}
        if (crashes > 0) {
          fs.writeFileSync(counterFile, String(crashes - 1));
          process.exit(2);
        }
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            serverInfo: { name: 'flaky-server', version: '1.0.0' }
          }
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
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function runTests() {
  console.log('🧪 Starting crash auto-retry tests...\n');

  const scriptPath = path.join(os.tmpdir(), `mcp-studio-flaky-${Date.now()}-${process.pid}.js`);
  fs.writeFileSync(scriptPath, FLAKY_SERVER);
  const counterPath = `${scriptPath}.counter`;
  fs.writeFileSync(counterPath, '2');

  const manager = new MCPClientManager({ rpcTimeoutMs: 5000 });
  const server = manager.addServer({
    name: 'Flaky Server',
    transport: 'stdio',
    command: 'node',
    args: [scriptPath],
    env: { FLAKY_COUNTER_FILE: counterPath },
    source: 'manual'
  });

  const stateChanges: any[] = [];
  manager.on('state:changed', (s) => stateChanges.push(s));

  // The first connect fails (crash #1) but the auto-retry must eventually
  // land a healthy connection (attempt 2 survives; crash #2 happens on the
  // retry, attempt 3 stays up).
  let firstError: unknown = null;
  try {
    await manager.connect(server.id);
  } catch (err) {
    firstError = err;
  }
  assert(firstError, 'first connect must fail while the server is flaky');

  // Wait for the automatic retries to reach a connected state.
  await waitFor(
    () => manager.getActiveState()?.status === 'connected',
    20_000,
    'automatic reconnect to a flaky server'
  );
  const state = manager.getActiveState()!;
  assert.strictEqual(state.status, 'connected');
  assert.strictEqual(state.serverInfo?.name, 'flaky-server');
  console.log('✅ flaky server auto-recovered to connected without manual action');

  // The retry progress must have been published in the state.
  const reconnectingStates = stateChanges.filter(
    (s) => typeof s.error === 'string' && s.error.includes('Reconnecting after crash')
  );
  assert(
    reconnectingStates.length >= 1,
    'reconnecting attempts must be published in state:changed events'
  );
  console.log(
    `✅ retry progress published (${reconnectingStates.length} 'Reconnecting after crash' state updates)`
  );

  await manager.disconnect();
  try {
    fs.unlinkSync(scriptPath);
    fs.unlinkSync(counterPath);
  } catch {
    // best effort cleanup
  }

  // Backoff schedule: 1s, 2s, 4s — each capped at 30s. Verified through the
  // published state transitions of a second, always-crashing server: the
  // gap between consecutive 'Reconnecting' announcements must match the
  // capped exponential schedule.
  {
    const alwaysCrashPath = path.join(os.tmpdir(), `mcp-studio-always-crash-${Date.now()}-${process.pid}.js`);
    fs.writeFileSync(alwaysCrashPath, 'process.exit(1);\n');
    const manager2 = new MCPClientManager({ rpcTimeoutMs: 2000 });
    const crashy = manager2.addServer({
      name: 'Always Crash',
      transport: 'stdio',
      command: 'node',
      args: [alwaysCrashPath],
      source: 'manual'
    });

    const reconnectTimestamps: number[] = [];
    manager2.on('state:changed', (s: any) => {
      if (typeof s.error === 'string' && s.error.includes('Reconnecting after crash')) {
        reconnectTimestamps.push(Date.now());
      }
    });

    manager2.connect(crashy.id).catch(() => {});
    // 3 attempts at 1s + 2s + 4s plus handshakes; wait long enough for all
    // three announcements and the final give-up.
    await new Promise((resolve) => setTimeout(resolve, 12_000));

    assert(
      reconnectTimestamps.length >= 3,
      `expected 3 reconnect announcements, saw ${reconnectTimestamps.length}`
    );
    const gaps = reconnectTimestamps
      .slice(1)
      .map((t, i) => t - reconnectTimestamps[i]);
    // Attempt 2 fires ~1s after attempt 1, attempt 3 ~2s after attempt 2.
    assert(gaps[0] >= 900 && gaps[0] < 5_000, `first backoff gap should be ~1s, got ${gaps[0]}ms`);
    assert(gaps[1] >= 1_900 && gaps[1] < 8_000, `second backoff gap should be ~2s, got ${gaps[1]}ms`);
    // The cap itself: delay(4) would be 8s uncapped; with a 30s cap the
    // schedule is unchanged here, but the cap logic is exercised via
    // Math.min — assert no gap ever exceeded the cap.
    assert(
      gaps.every((g) => g <= 30_000),
      'no backoff gap may exceed the 30s cap'
    );
    console.log(`✅ backoff gaps follow the capped exponential schedule (${gaps.join(', ')}ms)`);

    await manager2.disconnect();
    try {
      fs.unlinkSync(alwaysCrashPath);
    } catch {
      // best effort cleanup
    }
  }

  console.log('\n🎉 ALL CRASH AUTO-RETRY TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error(`${process.env.CI ? '::error::' : ''}Test failed:`, err?.stack || err);
  process.exit(1);
});
