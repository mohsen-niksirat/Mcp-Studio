import { test, expect } from '@playwright/test';
import { connectDemoServer } from './helpers';

/**
 * Test Collections: create a suite, add a single math_calculator step with an
 * assertion, run the suite, and verify the runner reports it as passed.
 */
test.describe('Test collections', () => {
  test('creates a suite with one math step and runs it green', async ({ page }) => {
    await connectDemoServer(page);

    await page.getByRole('button', { name: 'Test Suites' }).click();

    // Create a fresh suite (localStorage is empty in a new context, so the
    // built-in demo suite is the only one and this becomes "Custom Test Suite 2").
    await page.getByRole('button', { name: 'Add New Suite' }).click();
    await expect(page.getByText(/Custom Test Suite \d+/).first()).toBeVisible();

    // Add one step: math_calculator 7 x 8 asserting "56".
    await page.getByRole('button', { name: 'Add Step' }).click();
    await page.getByLabel('Target MCP Tool').selectOption('math_calculator');
    await page.getByLabel('Arguments JSON').fill('{"operation":"multiply","a":7,"b":8}');
    await page.getByLabel('Expected Substring Assertion (Optional)').fill('56');
    await page.getByRole('button', { name: 'Save Step' }).click();

    // The step is listed, then the whole suite runs and passes.
    await expect(page.getByText('math_calculator').first()).toBeVisible();
    await page.getByRole('button', { name: 'Run Entire Suite' }).click();
    await expect(page.getByText('PASSED', { exact: true })).toBeVisible({ timeout: 20_000 });
  });
});
