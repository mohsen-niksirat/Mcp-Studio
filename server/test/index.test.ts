import assert from 'assert';
import { MCPClientManager } from '../src/mcp/client-manager.js';

async function runTests() {
  console.log('🧪 Starting MCP-Studio Server Tests...\n');

  const manager = new MCPClientManager();

  // 1. Verify default server exists
  const servers = manager.getServers();
  assert(servers.length >= 1, 'Should have at least 1 default server');
  const demoServer = servers.find((s) => s.id === 'demo-mock-server');
  assert(demoServer, 'Demo mock server should be registered');
  console.log('✅ Default servers registered correctly');

  // 2. Connect to demo server
  const state = await manager.connect(demoServer.id);
  assert.strictEqual(state.status, 'connected', 'Server status should be connected');
  assert.strictEqual(state.serverInfo?.name, 'MCP-Studio Demo Server');
  console.log('✅ Connected to Mock MCP Server successfully');

  // 3. Test listTools
  const tools = await manager.listTools();
  assert(tools.length >= 4, `Expected at least 4 tools, got ${tools.length}`);
  const calc = tools.find((t) => t.name === 'math_calculator');
  assert(calc, 'math_calculator tool should exist');
  assert(calc.inputSchema.properties.operation, 'math_calculator should have operation schema');
  console.log(`✅ Tools listed successfully (${tools.length} tools discovered)`);

  // 4. Test callTool (math_calculator)
  const calcResult = await manager.callTool('math_calculator', {
    operation: 'multiply',
    a: 7,
    b: 8
  });
  assert(calcResult.content[0].text.includes('56'), '7 * 8 should equal 56');
  assert(calcResult.latencyMs !== undefined, 'Result should include latencyMs');
  console.log(`✅ math_calculator executed: ${calcResult.content[0].text} (latency: ${calcResult.latencyMs}ms)`);

  // 5. Test callTool (system_monitor)
  const sysResult = await manager.callTool('system_monitor', { unit: 'GB' });
  assert(sysResult.structuredData.platform, 'Should return platform in structuredData');
  console.log(`✅ system_monitor executed on platform: ${sysResult.structuredData.platform}`);

  // 6. Test listResources & readResource
  const resData = await manager.listResources();
  assert(resData.resources.length >= 3, 'Should list resources');
  const specRes = await manager.readResource('mock://system/specs');
  assert(specRes.contents[0].text.includes('platform'), 'Spec resource should contain platform');
  console.log(`✅ Resources listed & read successfully (${resData.resources.length} resources)`);

  // 7. Test listPrompts & getPrompt
  const prompts = await manager.listPrompts();
  assert(prompts.length >= 2, 'Should list prompts');
  const promptReview = await manager.getPrompt('code_review_assistant', {
    code: 'const x = 1;',
    language: 'typescript'
  });
  assert(promptReview.messages.length > 0, 'Prompt should return messages');
  console.log(`✅ Prompts listed & generated successfully (${prompts.length} prompts)`);

  // 8. Test logs
  const logs = manager.getLogs();
  assert(logs.length > 0, 'JSON-RPC logs should be populated');
  console.log(`✅ JSON-RPC log recorded ${logs.length} events`);

  // 9. Test benchmark
  const bench = await manager.runBenchmark(3);
  assert.strictEqual(bench.iterations, 3);
  assert.strictEqual(bench.successRate, 100);
  console.log(`✅ Benchmark completed: Avg Latency = ${bench.avgLatencyMs}ms, Success = ${bench.successRate}%`);

  // 10. Disconnect
  await manager.disconnect();
  assert.strictEqual(manager.getActiveState()?.status, 'disconnected');
  console.log('✅ Disconnected cleanly');

  console.log('\n🎉 ALL BACKEND PROTOCOL TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
