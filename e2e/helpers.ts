import { expect, type Page } from '@playwright/test';

/**
 * Firefox on a software-rendered Windows machine can hit a transient
 * NS_ERROR_CONNECTION_REFUSED while the dev servers are under load, even
 * though they stay up (later tests pass). One retry absorbs that noise;
 * real app failures happen after navigation and are not affected.
 */
export async function openApp(page: Page): Promise<void> {
  try {
    await page.goto('/');
  } catch (error) {
    if (!/CONNECTION_REFUSED|ERR_CONNECTION_REFUSED/.test(String(error))) throw error;
    await page.waitForTimeout(1_000);
    await page.goto('/');
  }
}

/**
 * The backend exposes a single global "active server", so every spec
 * explicitly selects the built-in demo server and waits for the connection
 * instead of relying on the state a previous test may have left behind.
 */
export async function connectDemoServer(page: Page): Promise<void> {
  await openApp(page);

  const navbar = page.getByRole('banner');
  const select = navbar.getByRole('combobox');
  await select.selectOption({ label: 'MCP-Studio Demo Server (MOCK)' });

  // Exact match: a case-insensitive /connected/ would also match "Disconnected".
  // 45s: firefox with a software renderer can take >20s on a cold dev server.
  await expect(navbar.getByText('connected', { exact: true })).toBeVisible({
    timeout: 45_000
  });
}
