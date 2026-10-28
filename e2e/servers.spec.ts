import { test, expect } from '@playwright/test';
import { connectDemoServer, openApp } from './helpers';

/**
 * Server management: initial load with the built-in demo server, and adding
 * a new stdio server entry through the ServerModal UI. The fake entry uses a
 * command that does not exist, so a failed spawn is expected and fine — the
 * spec only asserts that the server gets listed.
 */
test.describe('Server management', () => {
  test('app loads and the demo mock server connects automatically', async ({ page }) => {
    await connectDemoServer(page);

    const navbar = page.getByRole('banner');

    // The sidebar card shows the active server's name and transport.
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('MCP-Studio Demo Server')).toBeVisible();
    await expect(sidebar.getByText('mock', { exact: true })).toBeVisible();

    // The navbar server selector lists the demo server.
    const select = navbar.getByRole('combobox');
    await expect(select.locator('option', { hasText: 'MCP-Studio Demo Server' })).toHaveCount(1);
  });

  test('adds a fake stdio server via the Add Server modal', async ({ page }) => {
    await openApp(page);

    const navbar = page.getByRole('banner');
    const select = navbar.getByRole('combobox');
    await expect(select).toBeVisible({ timeout: 20_000 });

    await navbar.getByRole('button', { name: 'Add Server' }).click();

    const dialog = page.getByRole('dialog', { name: 'MCP Server Management' });
    await expect(dialog).toBeVisible();

    // The backend keeps every server added during the whole run (it is shared
    // by all browser projects), so the name must be unique per project or the
    // count assertion below would see siblings from earlier projects.
    const serverName = `E2E Fake Server (${test.info().project.name})`;

    // A command that cannot exist keeps the test hermetic: spawn fails fast
    // and the entry stays disconnected, which is all this spec asserts.
    await dialog.getByLabel('Server Name').fill(serverName);
    await dialog.getByLabel('Command').fill('definitely-not-a-real-command-e2e');
    await dialog.getByLabel('Arguments (space separated)').fill('');
    await dialog.getByRole('button', { name: 'Add Server' }).click();

    await expect(dialog).toBeHidden();
    await expect(select.locator('option', { hasText: serverName })).toHaveCount(1);
  });
});
