/**
 * Runs each backend test file in its own child process so the suites stay
 * isolated, while c8 still captures coverage for all of them: c8 sets
 * NODE_V8_COVERAGE for this process and every child inherits it, writing
 * V8 coverage data into the same temporary directory that c8 merges into
 * a single report.
 */
import { spawnSync } from 'child_process';

const testFiles = [
  'test/index.test.ts',
  'test/chat-proxy.test.ts',
  'test/crash-resilience.test.ts'
];

for (const file of testFiles) {
  console.log(`\n▶ Running ${file}...\n`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', file], {
    stdio: 'inherit',
    env: process.env
  });

  if (result.status !== 0) {
    console.error(
      `\n✖ ${file} exited with code ${result.status ?? `signal ${result.signal}`}`
    );
    process.exit(1);
  }
}

console.log('\n🎉 ALL BACKEND TEST FILES PASSED');
