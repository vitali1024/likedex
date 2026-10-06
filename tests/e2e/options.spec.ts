import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { OptionsTestControl } from '../options-harness/main';
import type { SyncAttempt } from '../../src/domain/contracts';
import { NOW, OBSERVED } from '../fixtures/storage';

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

async function open(mode = 'library', agreement = true, surface = 'options') {
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript((accepted) => {
    if (accepted) localStorage.setItem('likedex.privacy-agreement', 'phase7-v1');
    else localStorage.removeItem('likedex.privacy-agreement');
  }, agreement);
  await page.goto(`${origin}/options.html?mode=${mode}&surface=${surface}`);
  return page;
}
async function change(page: Page, mode: string, count?: number) {
  await page.evaluate(({ mode, count }) => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.change(mode, count), { mode, count });
}
async function checkpoint(page: Page, values: Partial<SyncAttempt>) {
  await page.evaluate((values) => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.checkpoint(values), values);
}

for (const surface of ['options', 'sidepanel']) {
  test(`${surface}: authoritative progress stays mounted across phases and settles into compact success`, async () => {
    const page = await open('active', true, surface);
    await page.setViewportSize({ width: surface === 'sidepanel' ? 360 : 1440, height: 900 });
    const status = page.getByRole('region', { name: 'Synchronization status' });
    const bar = page.getByRole('progressbar');
    await expect(bar).not.toHaveAttribute('aria-valuenow');
    await checkpoint(page, { state: 'scanning', rawItems: 100, uniqueMembership: 95, estimatedTotal: 200, pagesAccepted: 3, safeCommits: 3 });
    await expect(bar).toHaveAttribute('aria-valuenow', '50');
    await expect(bar).toHaveAttribute('aria-label', 'Scanning liked videos');
    await expect(status.getByText('100 of ~200 memberships scanned', { exact: true })).toBeVisible();
    await expect(status.locator('.notice')).toHaveCount(0);
    await expect(page.locator('.video-row')).toHaveCount(50);
    await expect(page.getByLabel('Search library')).toBeEnabled();
    await page.evaluate(() => {
      (window as unknown as { observedBar: Element | null }).observedBar = document.querySelector('[role="progressbar"]');
    });
    expect(await bar.locator('.sync-progress-fill').evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0.35s');
    for (const state of ['applying', 'scanning', 'finalizing'] as const) {
      await checkpoint(page, { state, rawItems: 175, uniqueMembership: 170, retrying: state === 'scanning' });
      await expect(bar).toHaveAttribute('aria-valuenow', '88');
      expect(await bar.evaluate((node) => node === (window as unknown as { observedBar: Element }).observedBar)).toBe(true);
      await expect(page.locator('.video-row')).toHaveCount(50);
      await expect(page.getByText('Loading local snapshot…')).toHaveCount(0);
      if (state === 'scanning') await expect(status.getByRole('status')).toContainText('Retrying a temporary request');
      await expect(status.locator('.sync-primary')).not.toContainText('Sync complete');
    }
    await page.clock.fastForward(500);
    await page.screenshot({ path: resolve(`.output/handoff-b-${surface}-active.png`), animations: 'disabled' });
    await checkpoint(page, { state: 'success', retrying: false, finishedAt: OBSERVED, rawItems: 200, uniqueMembership: 195 });
    await expect(bar).toHaveCount(0);
    const primary = status.locator('.sync-primary');
    await expect(primary).toContainText('Sync complete'); await expect(primary).toContainText('62 mirrored memberships');
    await expect(primary.locator('time')).toHaveCount(1); await expect(primary).toContainText('Updated');
    await expect(primary).not.toContainText('pages accepted');
    await expect(status.getByText('Last successful sync:', { exact: false })).toHaveCount(0);
    await expect(page.locator('.video-row')).toHaveCount(50);
    await status.getByText('Sync details', { exact: true }).click();
    await expect(status.getByText('3 pages accepted', { exact: false })).toBeVisible();
    await expect(status.getByText('195 unique memberships observed', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(status.locator('summary')).toBeFocused();
    await page.screenshot({ path: resolve(`.output/handoff-b-${surface}-success.png`), animations: 'disabled' });
    await page.close();
  });

  test(`${surface}: unknown total, partial failure, and account details retain truth`, async () => {
    const page = await open('active', true, surface);
    await page.setViewportSize({ width: surface === 'sidepanel' ? 480 : 1024, height: 900 });
    const bar = page.getByRole('progressbar');
    const status = page.getByRole('region', { name: 'Synchronization status' });
    const account = page.getByRole('region', { name: 'YouTube connection' });
    await expect(account.getByRole('heading', { name: 'My channel' })).toBeVisible();
    await expect(account.getByText('YouTube connected · read-only')).toBeVisible();
    await expect(account.getByText('Channel ID: owner-a')).not.toBeVisible();
    await account.getByText('Connection details', { exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(account.getByText('Channel ID: owner-a')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); await expect(account.locator('summary')).toBeFocused();
    await checkpoint(page, { state: 'preparing', rawItems: 0, uniqueMembership: 0, estimatedTotal: null });
    await expect(bar).toHaveCount(0); await expect(status.getByRole('status')).toContainText('Checking YouTube access');
    await checkpoint(page, { state: 'scanning', rawItems: 1750, uniqueMembership: 1700, estimatedTotal: null, safeCommits: 3 });
    await expect(bar).toBeVisible(); await expect(bar).not.toHaveAttribute('aria-valuenow');
    await expect(status.locator('.sync-primary')).toContainText('1,750 memberships scanned');
    await expect(status.locator('.sync-primary')).not.toContainText('%');
    await expect(status.locator('.notice')).toHaveCount(0);
    await checkpoint(page, { state: 'finalizing' });
    await expect(bar).not.toHaveAttribute('aria-valuenow');
    await expect(status.locator('.sync-primary')).not.toContainText('Sync complete');
    await checkpoint(page, { state: 'partial', finishedAt: OBSERVED,
      error: { category: 'network', messageKey: 'network-failed', phase: 'scanning' } });
    await expect(bar).toHaveCount(0);
    await expect(status.getByRole('alert')).toContainText('network request failed');
    await expect(status.locator('.notice')).toContainText('partially updated');
    await expect(status.locator('.sync-prior')).toContainText('Last successful sync:');
    await expect(status.locator('.sync-prior')).toContainText('2 mirrored memberships');
    await expect(page.locator('.video-row')).toHaveCount(50);
    await change(page, 'unknown-title'); await expect(account.getByRole('heading', { name: 'YouTube channel', exact: true })).toBeVisible();
    await change(page, 'mismatch');
    await expect(account.getByText('Local library owner:', { exact: false })).toContainText('owner-a');
    await expect(account.getByText('Connected channel:', { exact: false })).toContainText('owner-b');
    await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeDisabled();
    await page.close();
  });

  test(`${surface}: badge fits low, middle and high checkpoints with reduced motion`, async () => {
    const page = await open('active', true, surface);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const widths = surface === 'sidepanel' ? [360, 480, 320] : [800, 1024, 1200, 1440];
    const bar = page.getByRole('progressbar');
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      for (const rawItems of [0, 5, 100, 190, 200]) {
        await checkpoint(page, { rawItems, uniqueMembership: rawItems, estimatedTotal: 200 });
        await expect(bar).toHaveAttribute('aria-valuenow', String(Math.round(rawItems / 2)));
        const bounds = await bar.boundingBox(); const badge = await bar.locator('.sync-progress-badge').boundingBox();
        expect(bounds).not.toBeNull(); expect(badge).not.toBeNull();
        expect(badge!.x).toBeGreaterThanOrEqual(bounds!.x);
        expect(badge!.x + badge!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await page.getByText('Sync details', { exact: true }).click();
      const details = page.locator('.sync-disclosure .disclosure-content');
      await expect(details).toBeVisible();
      const bounds = await details.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.keyboard.press('Escape');
    }
    expect(await bar.locator('.sync-progress-fill').evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s');
    expect(await bar.locator('.sync-progress-badge').evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s');
    await checkpoint(page, { rawItems: 175, uniqueMembership: 175, estimatedTotal: null });
    await expect(bar).toBeVisible(); await expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(await bar.locator('.sync-progress-fill').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    await expect(page.getByText('175 memberships scanned', { exact: true })).toBeVisible();
    await page.close();
  });
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
  await page.clock.fastForward(3000);
  await page.screenshot({ path: resolve('.output/phase7-options-wide.png'), fullPage: false, animations: 'disabled' });
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
  await expect(page.locator('.sync-primary')).toContainText('Sync complete');
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
  for (const width of [1440, 1200, 1024, 800, 600, 480, 360]) {
    await page.setViewportSize({ width, height: 650 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByText('Filter library', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Next page' }).click();
  const row = page.locator('.video-row').first(); await row.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Video detail' })).toBeFocused();
  await page.screenshot({ path: resolve('.output/phase7-options-narrow.png'), fullPage: false, animations: 'disabled' });
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
  await change(page, 'active'); await expect(page.getByRole('status').filter({ hasText: 'Scanning liked videos' })).toBeVisible();
  await expect(page.getByText('60 memberships scanned', { exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
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

test('row actions, arrow selection and filter dismissal preserve local query context', async () => {
  const page = await open();
  await page.setViewportSize({ width: 1440, height: 900 });
  const rows = page.locator('.video-row');
  await expect(rows).toHaveCount(50);
  await rows.first().focus(); await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused(); await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('complementary', { name: 'Video detail' }).getByRole('heading')).toHaveText('Video 002');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }));
  const card = page.locator('.video-card').first();
  await card.getByRole('button', { name: 'Copy link for A café in the mountains', exact: true }).click();
  await expect(card.getByRole('status')).toHaveText('Link copied.');
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe('https://www.youtube.com/watch?v=v0000000000');
  await expect(card.getByRole('link')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=v0000000000');
  await page.getByLabel('Search library').fill('video');
  await page.getByText('Filter library', { exact: true }).click();
  await page.getByLabel('Channels', { exact: true }).selectOption(['channel-a', 'channel-b']);
  await page.keyboard.press('Escape');
  await expect(page.locator('.filters > summary')).toBeFocused();
  await expect(page.getByLabel('Channels', { exact: true })).not.toBeVisible();
  await expect(page.getByLabel('Active filters').getByRole('button')).toHaveCount(2);
  await page.getByLabel('Active filters').getByRole('button', { name: 'Travel' }).click();
  await expect(page.getByLabel('Active filters').getByRole('button')).toHaveCount(1);
  await expect(page.getByLabel('Search library')).toHaveValue('video');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.getByLabel('Search library')).toBeFocused();
  await expect(page.getByLabel('Search library')).toHaveValue('');
  await page.close();
});

test('privacy dialog traps focus, dismisses with Escape and restores the invoking control', async () => {
  const page = await open();
  const trigger = page.getByRole('button', { name: 'Privacy & terms' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Privacy & terms' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close privacy notice' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog.getByRole('button', { name: 'Close privacy notice' }).click();
  await expect(trigger).toBeFocused();
  await page.close();
});

test('Side Panel expands one row and detail Back restores page, query, scroll and focus', async () => {
  const page = await open('library', true, 'sidepanel');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const rows = page.locator('.video-row');
  await expect(rows).toHaveCount(50);
  await rows.first().click(); await expect(rows.first()).toHaveAttribute('aria-expanded', 'true');
  await rows.nth(1).click(); await expect(rows.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(rows.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'View details' })).toHaveCount(1);
  await page.getByLabel('Search library').fill('video');
  await page.getByRole('button', { name: 'Next page' }).click();
  await rows.nth(3).click();
  const view = page.getByRole('button', { name: 'View details' });
  await view.scrollIntoViewIfNeeded();
  const scroll = await page.locator('.results-scroll').evaluate((node) => node.scrollTop);
  await view.click();
  const detail = page.getByRole('complementary', { name: 'Video detail' });
  await expect(detail).toBeFocused(); await expect(detail.getByRole('heading')).toHaveText('Video 055');
  await page.keyboard.press('Escape');
  await expect(view).toBeFocused(); await expect(page.getByLabel('Search library')).toHaveValue('video');
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  expect(await page.locator('.results-scroll').evaluate((node) => node.scrollTop)).toBe(scroll);
  await view.click(); await change(page, 'library', 2);
  await expect(page.getByText('The selected video is no longer in these results.')).toBeVisible();
  await expect(page.locator('.results')).toBeFocused();
  await expect(page.getByText('Page 1 of 1')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 480 });
  await page.getByText('Filter library', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls)).not.toContain('SYNC_START');
  await page.close();
});

test('3547-record library stays page bounded and local while selection and filters change', async () => {
  const page = await open();
  await change(page, 'library', 3547);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.video-row')).toHaveCount(50);
  const calls = await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls]);
  await page.getByLabel('Search library').fill('video');
  await page.getByLabel('Sort', { exact: true }).selectOption('duration-shortest');
  await page.getByLabel('Duration', { exact: true }).selectOption('medium');
  await expect(page.locator('.video-row')).toHaveCount(50);
  await page.locator('.video-row').nth(4).click();
  await expect(page.getByRole('complementary', { name: 'Video detail' }).getByRole('heading')).toBeVisible();
  expect(await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls])).toEqual(calls);
  await page.close();
});

test('consecutive page revision bursts keep identity, progress and local browsing usable in flight', async () => {
  const page = await open('active');
  await expect(page.locator('.video-row')).toHaveCount(50);
  await expect(page.getByRole('heading', { name: 'My channel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync in progress', exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const violations: string[] = [];
    (window as unknown as { syncViolations: string[] }).syncViolations = violations;
    new MutationObserver(() => {
      if (!document.querySelector('.video-row')) violations.push('rows disappeared');
      if (document.querySelector<HTMLInputElement>('[aria-label="Search library"]')?.disabled) violations.push('search disabled');
      if (!document.querySelector('.connection h2')) violations.push('identity disappeared');
      if (!document.querySelector('.header-actions button')?.textContent?.includes('Sync in progress')) violations.push('sync became idle');
      if (document.querySelector('.loading-state, .empty.error')) violations.push('library loading/error');
    }).observe(document.querySelector('main')!, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await page.getByLabel('Search library').fill('video');
  await page.getByText('Filter library', { exact: true }).click();
  await page.getByLabel('Channels', { exact: true }).selectOption(['channel-a']);
  await page.getByLabel('Duration', { exact: true }).selectOption('medium');
  await page.getByLabel('Sort', { exact: true }).selectOption('title');
  await expect(page.locator('.video-row')).toHaveCount(10);
  for (let number = 3; number <= 6; number++) {
    await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.holdReads());
    for (const [count, phase] of [[number - 1, 'applying'], [number, 'applying'], [number, 'scanning']] as const) {
      await page.evaluate(({ count, phase }) => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.progress(count, phase), { count, phase });
      await expect.poll(() => page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.pendingReads())).toBeGreaterThanOrEqual(2);
      await expect(page.locator('.video-row')).toHaveCount(10);
      await expect(page.getByLabel('Search library')).toBeEnabled();
      await expect(page.getByLabel('Channels', { exact: true })).toBeEnabled();
      await expect(page.getByLabel('Date basis', { exact: true })).toBeEnabled();
      await expect(page.getByLabel('Duration', { exact: true })).toBeEnabled();
      await expect(page.getByLabel('Sort', { exact: true })).toBeEnabled();
      await expect(page.getByRole('heading', { name: 'My channel' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sync in progress', exact: true })).toBeDisabled();
      // Search is actually used while both authoritative reads are held.
      await page.getByLabel('Search library').fill('video 004'); await expect(page.locator('.video-row')).toHaveCount(1);
      await page.getByLabel('Search library').fill('video'); await expect(page.locator('.video-row')).toHaveCount(10);
    }
    await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
    await expect(page.getByText(`${number * 50} memberships scanned`, { exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Scanning liked videos' })).toBeVisible();
    await expect(page.getByText('Loading local snapshot…')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Library unavailable' })).toHaveCount(0);
    await expect(page.getByText('Local storage could not be read or saved.', { exact: false })).toHaveCount(0);
  }
  expect(await page.evaluate(() => (window as unknown as { syncViolations: string[] }).syncViolations)).toEqual([]);
  await page.close();
});

for (const boundary of ['generation', 'epoch'] as const) {
  test(`${boundary} revision immediately clears library and auth identity while refresh is held`, async () => {
    const page = await open('active');
    await expect(page.getByRole('heading', { name: 'My channel' })).toBeVisible();
    await page.evaluate((boundary) => {
      const h = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest;
      h.holdReads(); h.invalidate(boundary);
    }, boundary);
    await expect(page.locator('.video-row')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'My channel' })).toHaveCount(0);
    await expect(page.getByLabel('Search library')).toBeDisabled();
    await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
    await expect(page.getByText('Connected, never synced.', { exact: false })).toBeVisible();
    await expect(page.locator('.video-row')).toHaveCount(0);
    await page.close();
  });
}

test('hidden surface drops cached data and ignores held replies until a fresh visible observation', async () => {
  const page = await open('active');
  await expect(page.getByRole('heading', { name: 'My channel' })).toBeVisible();
  await page.evaluate(() => {
    const h = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest;
    h.holdReads(); h.progress(3, 'applying');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    h.releaseReads();
  });
  await expect(page.locator('.video-row')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'My channel' })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.video-row')).toHaveCount(50);
  await expect(page.getByRole('heading', { name: 'My channel' })).toBeVisible();
  await page.close();
});

test('auth alone fences a cached library on a dropped context broadcast and late library response', async () => {
  const page = await open('active');
  await expect(page.getByRole('heading', { name: 'My channel' })).toBeVisible();
  await page.evaluate(() => {
    const h = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest;
    h.holdReads(['LIBRARY_SNAPSHOT_GET']); h.invalidate('generation', false);
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('.video-row')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'My channel' })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
  await expect(page.getByText('Connected, never synced.', { exact: false })).toBeVisible();
  await expect(page.locator('.video-row')).toHaveCount(0);
  await page.close();
});

test('same-context passive auth pending retains eligible identity, but an actual auth failure fences a delayed library reply', async () => {
  const page = await open('active');
  await expect(page.getByRole('heading', { name: 'My channel' })).toBeVisible();
  await page.evaluate(() => {
    const h = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest;
    h.holdReads(['LIBRARY_SNAPSHOT_GET']); h.change('auth-pending');
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.pendingReads())).toBe(1);
  await expect(page.locator('.video-row')).toHaveCount(50);
  await expect(page.getByRole('heading', { name: 'My channel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync in progress', exact: true })).toBeDisabled();
  await change(page, 'auth-error');
  await expect(page.getByRole('heading', { name: 'Connection status unavailable' })).toBeVisible();
  await expect(page.locator('.video-row')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
  await expect(page.getByRole('heading', { name: 'Library unavailable' })).toBeVisible();
  await expect(page.locator('.video-row')).toHaveCount(0);
  await page.close();
});
