import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the real stack: the Express backend on :4999
 * and the Vite dev server (which proxies /api and /ws to it) on :5173.
 * Playwright starts both and waits for their readiness URLs before running.
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: '.',
  /**
   * The backend holds ONE global active-server state, so tests must run one
   * at a time; every spec (re-)establishes its own precondition instead.
   */
  fullyParallel: false,
  workers: 1,
  // Firefox (software renderer on Windows) needs ~15s for the first dev-server
  // page load and ~1s per action; 30s is too tight for the full flow. On
  // machines without GPU acceleration firefox can also hang sporadically under
  // a full-suite load (see e2e/README.md); CI only runs chromium.
  timeout: 90_000,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: isCI
    ? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } }
      ],
  webServer: [
    {
      command: 'pnpm --filter mcp-studio-server dev',
      url: 'http://localhost:4999/api/servers',
      reuseExistingServer: !isCI,
      timeout: 120_000
    },
    {
      command: 'pnpm --filter mcp-studio-client dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 120_000
    }
  ]
});
