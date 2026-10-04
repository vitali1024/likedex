import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { OptionsTestControl } from '../options-harness/main';
import { NOW } from '../fixtures/storage';

const path = resolve('.output/options-test-composition');
let context: BrowserContext;
let origin: string;
const pageErrors: string[] = [];
test.beforeAll(async () => {
  // Start from the real approved-gate extension and overwrite ONLY its Options
  // entry with an explicitly identified test adapter. Never build into production.
  await cp(resolve('.output/chrome-mv3'), path, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(path, 'manifest.json'), 'utf8'));
  manifest.name = 'Likedex — Options test composition';
  manifest.description = 'Separate deterministic Options component/browser tests; not a production package.';
  await writeFile(resolve(path, 'manifest.json'), JSON.stringify(manifest));
  await build({ configFile: false, root: resolve('tests/options-harness'), resolve: { alias: { '@': resolve('.') } },
    build: { outDir: path, emptyOutDir: false, rollupOptions: { input: resolve('tests/options-harness/options.html') } }, logLevel: 'warn' });
  context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`] });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  origin = `chrome-extension://${new URL(worker.url()).hostname}`;
});
test.afterAll(async () => { await context?.close(); });
test.afterEach(() => { expect(pageErrors).toEqual([]); });

async function open(mode = 'library', agreement = true) {
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript((accepted) => {
    if (accepted) localStorage.setItem('likedex.privacy-agreement', 'phase7-v1');
    else localStorage.removeItem('likedex.privacy-agreement');
  }, agreement);
  await page.goto(`${origin}/options.html?mode=${mode}`);
  return page;
}
async function change(page: Page, mode: string, count?: number) {
  await page.evaluate(({ mode, count }) => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.change(mode, count), { mode, count });
}

test('first run requires privacy agreement and explicit Connect; pending, denial and retry are truthful', async () => {
  const page = await open('connect-failure', false);
  await expect(page.getByRole('heading', { name: 'Find that video again.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect YouTube', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls.includes('AUTH_CONNECT'))).toBe(false);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Connect YouTube', exact: true }).click();
  await expect(page.getByText('Read-only permission was denied or cancelled.', { exact: false })).toBeVisible();
  await change(page, 'disconnected');
  await page.getByRole('button', { name: 'Connect YouTube', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My channel' })).toBeVisible();
  await expect(page.getByText('Connected, never synced.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls.filter((c) => c === 'AUTH_CONNECT').length)).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls)).not.toContain('SYNC_START');
  await page.close();
});

test('local search/filter/sort/page/selection and canonical links; production auth precondition preserves library', async () => {
  const page = await open();
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const rows = page.locator('.video-row');
  await expect(rows).toHaveCount(50);
  const beforeLocalInteraction = await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls]);
  await page.screenshot({ path: resolve('.output/phase7-options-wide.png'), fullPage: false });
  await page.getByRole('button', { name: 'Next page' }).click(); await expect(rows).toHaveCount(12);
  await page.getByLabel('Search library').fill('café travel'); await expect(rows).toHaveCount(1);
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  await rows.first().click();
  const detail = page.getByRole('complementary', { name: 'Video detail' });
  await expect(detail.getByRole('heading', { name: 'A café in the mountains' })).toBeVisible();
  await expect(detail.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=v0000000000');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }));
  await detail.getByRole('button', { name: 'Copy link' }).click(); await expect(detail.getByText('Link copied.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe('https://www.youtube.com/watch?v=v0000000000');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('test clipboard unavailable'); } } }));
  await detail.getByRole('button', { name: 'Copy link' }).click(); await expect(detail.getByText('Could not copy the link.', { exact: false })).toBeVisible();
  await page.getByLabel('Search library').fill('nothing like this');
  await expect(page.getByRole('heading', { name: 'No matching videos' })).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'Select a video' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters' }).click(); await expect(rows).toHaveCount(50);
  await page.getByText('Filter library', { exact: true }).click();
  await page.getByLabel('Search library').fill('video');
  await page.getByLabel('Duration', { exact: true }).selectOption('medium');
  await expect(rows).toHaveCount(21);
  await page.getByLabel('Channels', { exact: true }).selectOption(['channel-a']); await expect(rows).toHaveCount(10);
  await page.getByLabel('Sort', { exact: true }).selectOption('duration-longest');
  await page.getByRole('button', { name: 'Clear filters' }).click(); await expect(rows).toHaveCount(50);
  await expect(page.getByLabel('Search library')).toHaveValue('video');
  await page.getByLabel('Search library').fill('');
  expect(await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls])).toEqual(beforeLocalInteraction);
  expect(beforeLocalInteraction).not.toContain('SYNC_START'); // Mount/local actions never sync.
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  await expect(page.getByText('YouTube authorization is required. Connect YouTube to continue.', { exact: false })).toBeVisible();
  await expect(page.getByText('Synchronization is temporarily unavailable', { exact: false })).toHaveCount(0);
  await expect(rows).toHaveCount(50);
  await expect(page.getByText('Last successful sync:', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls.filter((c) => c === 'SYNC_START').length)).toBe(1);
  expect(errors).toEqual([]); await page.close();
});

test('keyboard shortcut, narrow focused detail/Back, page context and no horizontal clipping', async () => {
  const page = await open();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(page.locator('.video-row')).toHaveCount(50);
  await expect(page.getByRole('heading', { name: 'My channel' })).toBeVisible();
  const idleReads = await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls.filter((c) => c === 'LIBRARY_SNAPSHOT_GET').length);
  await page.clock.fastForward(6000);
  expect(await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls.filter((c) => c === 'LIBRARY_SNAPSHOT_GET').length)).toBe(idleReads);
  await page.locator('h1').click(); await page.keyboard.press('/'); await expect(page.getByLabel('Search library')).toBeFocused();
  await page.getByLabel('Search library').fill('video'); await page.keyboard.press('/'); await expect(page.getByLabel('Search library')).toHaveValue('video/');
  await page.getByLabel('Search library').fill('');
  for (const width of [1200, 800, 600, 360]) {
    await page.setViewportSize({ width, height: 650 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByText('Filter library', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Next page' }).click();
  const row = page.locator('.video-row').first(); await row.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Video detail' })).toBeFocused();
  await page.screenshot({ path: resolve('.output/phase7-options-narrow.png'), fullPage: false });
  await page.getByRole('button', { name: 'Back to library' }).click(); await expect(page.getByText('Page 2 of 2')).toBeVisible(); await expect(row).toBeFocused();
  await change(page, 'library', 2); await expect(page.getByText('Page 1 of 1')).toBeVisible(); await expect(page.locator('.video-row')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Open on YouTube' })).toHaveCount(0);
  await page.close();
});

test('runtime failure, owner mismatch, active sync and later failure never masquerade as idle or empty', async () => {
  const page = await open('snapshot-error');
  await expect(page.getByRole('heading', { name: 'Library unavailable' })).toBeVisible();
  await expect(page.getByText('Sync status unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByText('0 available videos', { exact: false })).toHaveCount(0);
  await change(page, 'auth-error'); await expect(page.getByRole('heading', { name: 'Connection status unavailable' })).toBeVisible();
  await change(page, 'mismatch'); await expect(page.getByRole('heading', { name: 'Different YouTube channel' })).toBeVisible();
  await expect(page.getByText('Local library owner:', { exact: false })).toContainText('owner-a');
  await expect(page.getByText('Connected channel:', { exact: false })).toContainText('owner-b');
  await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeDisabled();
  await change(page, 'active'); await expect(page.getByText('Scanning liked videos', { exact: true })).toBeVisible();
  await expect(page.getByText('2 pages accepted · 60 unique memberships observed')).toBeVisible();
  const activeReads = await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls.filter((c) => c === 'LIBRARY_SNAPSHOT_GET').length);
  await page.clock.fastForward(2000);
  await expect.poll(() => page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls.filter((c) => c === 'LIBRARY_SNAPSHOT_GET').length)).toBeGreaterThan(activeReads);
  await change(page, 'later-failure'); await expect(page.getByText('Sync failed', { exact: true })).toBeVisible();
  await expect(page.getByText('Last successful sync:', { exact: false })).toBeVisible(); await expect(page.locator('.video-row')).toHaveCount(50);
  await page.close();
});

test('expiry with a missed notification discards cached detail and rows before reuse', async () => {
  const page = await open(); await expect(page.locator('.video-row')).toHaveCount(50); await page.locator('.video-row').first().click();
  await page.clock.setSystemTime(new Date('2026-10-16T00:00:00.000Z'));
  // A delayed deadline timer must not permit a stale Copy action either.
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('heading', { name: 'Library unavailable' })).toBeVisible();
  await expect(page.locator('.video-row')).toHaveCount(0); await expect(page.getByRole('link', { name: 'Open on YouTube' })).toHaveCount(0);
  await page.close();
});

test('agreement storage failure stays visible and never invokes Connect', async () => {
  const page = await open('disconnected', false);
  await expect(page.getByRole('checkbox')).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('test storage failure'); }; });
  await page.getByRole('checkbox').click();
  await expect(page.getByText('Your privacy agreement could not be saved.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect YouTube', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls.includes('AUTH_CONNECT'))).toBe(false);
  await page.close();
});
