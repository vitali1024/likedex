import console from 'node:console';
import { resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import type { browser } from 'wxt/browser';

test('Phase 1 production extension loads worker and both shells', async () => {
  const extensionPath = resolve('.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const actualLoadedExtensionId = new URL(worker.url()).hostname;
    expect(actualLoadedExtensionId).toBe('mmefiakgfhddiojfdnkfpfpbkgbfgkgj');
    console.log(`Loaded production extension ID: ${actualLoadedExtensionId}`);
    const origin = `chrome-extension://${actualLoadedExtensionId}`;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    for (const [path, surface] of [['options.html', 'Options'], ['sidepanel.html', 'Side Panel']] as const) {
      await page.goto(`${origin}/${path}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Likedex', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: surface, exact: true })).toBeVisible();
      await expect(page.getByText('Development foundation. Product features are not available yet.')).toBeVisible();
    }
    expect(errors).toEqual([]);
    // This checks the real browser API configuration, not native toolbar clicking.
    await expect.poll(() => worker.evaluate(() =>
      (globalThis as unknown as { chrome: typeof browser }).chrome.sidePanel.getPanelBehavior(),
    )).toEqual({ openPanelOnActionClick: true });
  } finally {
    await context.close();
  }
});
