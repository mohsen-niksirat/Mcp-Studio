import { test, expect } from '@playwright/test';
import { connectDemoServer } from './helpers';

/**
 * Tools Runner: the demo server's tool catalog, dynamic schema form input,
 * tool execution, and the JSON-RPC protocol inspector.
 */
test.describe('Tools runner', () => {
  test('lists math_calculator and runs 7 x 8 = 56', async ({ page }) => {
    await connectDemoServer(page);

    // Tools Runner is the default tab; select the calculator tool.
    await page.getByRole('button', { name: 'math_calculator' }).click();

    // Fill the dynamic schema form (labels are associated via htmlFor; the
    // required-marker asterisk is aria-hidden but still part of the label
    // text, so match with a word boundary instead of an exact string).
    await page.getByLabel(/^a\b/).fill('7');
    await page.getByLabel(/^b\b/).fill('8');
    await page.getByLabel(/^operation\b/).selectOption('multiply');

    await page.getByRole('button', { name: 'Run Tool (tools/call)' }).click();

    // The formatted response shows the mock server's calculation result.
    await expect(page.getByText(/7 multiply 8 = 56/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Success', { exact: true })).toBeVisible();

    // The protocol inspector records the JSON-RPC frames of the call.
    await page.getByRole('button', { name: 'Protocol Inspector' }).click();
    await expect(page.getByText('tools/call').first()).toBeVisible({ timeout: 10_000 });
    // The request frame carries the arguments; the response carries the result.
    await expect(page.getByText(/multiply/).first()).toBeVisible();
    await expect(page.getByText(/56/).first()).toBeVisible();
  });
});
