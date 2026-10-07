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

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
}
async function committedView(page: Page) {
  return page.evaluate(() => ({
    rows: [...document.querySelectorAll('.video-row')].map((node) => [node.getAttribute('data-video-id'), node.getAttribute('aria-pressed'), node.getAttribute('aria-expanded')]),
    page: document.querySelector('.pagination')?.textContent,
    chips: document.querySelector('.active-filters')?.textContent,
    detail: document.querySelector('.detail-host h2')?.textContent,
    badge: document.querySelector('.filter-count')?.textContent,
    results: document.querySelector('.results-heading')?.textContent,
  }));
}
for (const surface of ['options', 'sidepanel']) {
  test(surface + ': channel and date drafts preserve results until one Apply', async () => {
    const page = await open('library', true, surface);
    await page.setViewportSize({ width: surface === 'options' ? 1440 : 360, height: 900 });
    await expect(page.locator('.video-row')).toHaveCount(50);
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.locator('.video-row[data-video-id="v0000000051"]').click();
    const before = await committedView(page);
    await page.evaluate(() => {
      const changes: string[] = [];
      (window as unknown as { resultChanges: string[] }).resultChanges = changes;
      const count = document.querySelector('.results-heading h2 > span')!;
      new MutationObserver(() => changes.push(count.textContent ?? '')).observe(count, { subtree: true, childList: true, characterData: true });
    });
    const calls = await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls]);
    await page.getByRole('button', { name: 'Filter library', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Search channels', exact: true });
    await expect(search).toBeFocused();
    await search.press('/'); await expect(search).toHaveValue('/'); await expect(page.getByLabel('Search library')).toHaveValue('');
    await search.fill('travel'); await search.press('Tab');
    await expect(page.getByRole('checkbox', { name: 'Travel', exact: true })).toBeFocused();
    await page.keyboard.press('Space');
    expect(await committedView(page)).toEqual(before);
    await search.fill('music'); await page.getByRole('checkbox', { name: 'Music', exact: true }).check();
    expect(await committedView(page)).toEqual(before);
    await search.fill('absent'); await expect(page.getByText('No matching channels', { exact: true })).toBeVisible();
    await search.fill('travel'); await expect(page.getByRole('checkbox', { name: 'Travel', exact: true })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Travel', exact: true }).uncheck();
    await search.fill(''); await page.getByRole('checkbox', { name: 'Music', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
    await choose(page, 'Date basis', 'Published date');
    await page.getByLabel('From', { exact: true }).fill('2026-09-15');
    await page.getByLabel('Through', { exact: true }).fill('2026-09-15');
    expect(await committedView(page)).toEqual(before);
    expect(await page.evaluate(() => (window as unknown as { resultChanges: string[] }).resultChanges)).toEqual([]);
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Filters', exact: true })).toHaveCount(0);
    await expect(page.locator('.video-row')).toHaveCount(30);
    expect(await page.evaluate(() => (window as unknown as { resultChanges: string[] }).resultChanges)).toEqual(['30 results']);
    await expect(page.getByText('Page 1 of 1')).toBeVisible();
    await expect(page.locator('.filter-count')).toHaveText('Active filter groups: 2');
    await expect(page.getByText('The selected video is no longer in these results.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls])).toEqual(calls);
    await page.close();
  });

  test(surface + ': Escape, outside and trigger closing discard drafts and local channel search', async () => {
    const page = await open('library', true, surface);
    await page.setViewportSize({ width: surface === 'options' ? 1440 : 360, height: 900 });
    const trigger = page.getByRole('button', { name: 'Filter library', exact: true });
    await trigger.click(); await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    const before = await committedView(page);
    for (const dismissal of ['Escape', 'outside', 'trigger']) {
      await trigger.click(); await page.getByRole('checkbox', { name: 'Music', exact: true }).check();
      await choose(page, 'Date basis', 'Published date'); await page.getByLabel('From', { exact: true }).fill('2026-09-15');
      await page.getByRole('searchbox', { name: 'Search channels', exact: true }).fill('music');
      if (dismissal === 'Escape') await page.keyboard.press('Escape');
      else if (dismissal === 'outside') await page.locator('h1').click();
      else await trigger.click();
      expect(await committedView(page)).toEqual(before);
      await trigger.click();
      await expect(page.getByRole('searchbox', { name: 'Search channels', exact: true })).toHaveValue('');
      await expect(page.getByRole('checkbox', { name: 'Travel', exact: true })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Music', exact: true })).not.toBeChecked();
      await expect(page.getByRole('button', { name: 'Date basis', exact: true })).toContainText('Liked date');
      await expect(page.getByLabel('From', { exact: true })).toHaveValue('');
      await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    }
    await page.close();
  });

  test(surface + ': channel Clear and panel Clear filters edit only the draft', async () => {
    const page = await open('library', true, surface);
    await page.setViewportSize({ width: surface === 'options' ? 1440 : 360, height: 900 });
    await page.getByLabel('Search library').fill('video');
    await choose(page, 'Duration', '4 to under 20 minutes'); await choose(page, 'Sort', 'Title A–Z');
    const trigger = page.getByRole('button', { name: 'Filter library', exact: true });
    await trigger.click(); await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
    await choose(page, 'Date basis', 'Published date'); await page.getByLabel('From', { exact: true }).fill('2026-09-15');
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    const before = await committedView(page);
    await trigger.click(); await page.getByRole('button', { name: 'Clear channels', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Travel', exact: true })).not.toBeChecked();
    expect(await committedView(page)).toEqual(before); await page.keyboard.press('Escape');
    await trigger.click(); await expect(page.getByRole('checkbox', { name: 'Travel', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    expect(await committedView(page)).toEqual(before);
    await expect(page.getByLabel('From', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Date basis', exact: true })).toContainText('Liked date');
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await expect(page.locator('.video-row')).toHaveCount(21);
    await expect(page.getByLabel('Search library')).toHaveValue('video');
    await expect(page.getByRole('button', { name: 'Duration', exact: true })).toContainText('4 to under 20 minutes');
    await expect(page.getByRole('button', { name: 'Sort', exact: true })).toContainText('Title A–Z');
    await expect(page.locator('.filter-count')).toHaveAttribute('data-empty', 'true');
    await page.close();
  });

  test(surface + ': sibling popups close and Escape dismisses the deepest menu', async () => {
    const page = await open('library', true, surface);
    await page.setViewportSize({ width: surface === 'options' ? 1440 : 360, height: 900 });
    const trigger = page.getByRole('button', { name: 'Filter library', exact: true });
    await page.getByRole('button', { name: 'Duration', exact: true }).click();
    // The narrow toolbar wraps; click the exposed right edge beside Duration's menu.
    await trigger.click({ position: { x: (await trigger.boundingBox())!.width - 12, y: 22 } });
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
    const date = page.getByRole('button', { name: 'Date basis', exact: true });
    await date.click(); await page.keyboard.press('Escape'); await expect(date).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Filters', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Travel', exact: true })).toBeChecked();
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await trigger.click(); await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
    await page.getByRole('button', { name: 'Sort', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Filters', exact: true })).toHaveCount(0);
    // Sort's menu is right aligned: the opposite edge remains exposed.
    await trigger.click({ position: { x: 12, y: 22 } });
    await expect(page.getByRole('checkbox', { name: 'Travel', exact: true })).not.toBeChecked();
    await page.close();
  });

  test(surface + ': fixed filter geometry, bounded scrolling and date validation fit supported widths', async () => {
    const page = await open('channel-cases', true, surface);
    await expect(page.locator('.video-row')).toHaveCount(50);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of surface === 'options' ? [800, 1024, 1200, 1440] : [320, 360, 480]) {
      await page.setViewportSize({ width, height: 800 });
      const trigger = page.getByRole('button', { name: 'Filter library', exact: true });
      const anchor = await trigger.boundingBox();
      await trigger.click();
      const panel = page.getByRole('dialog', { name: 'Filters', exact: true });
      const bounds = (await panel.boundingBox())!;
      const assertStable = async () => {
        const after = (await panel.boundingBox())!;
        for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after[key] - bounds[key])).toBeLessThan(1);
      };
      await expect(page.getByRole('checkbox')).toHaveCount(100);
      await expect(page.getByRole('checkbox', { name: 'Same name UC-000-same-suffix', exact: true })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Channel name unknown UC-002-same-suffix', exact: true })).toHaveCount(1);
      await expect(page.getByRole('checkbox', { name: '<script> & "Channel"', exact: true })).toHaveCount(1);
      await expect(page.locator('.channel-section script')).toHaveCount(0);
      await expect(page.locator('.channel-option small')).toHaveCount(4);
      expect(await page.locator('.channel-options').evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
      const search = page.getByRole('searchbox', { name: 'Search channels', exact: true });
      await search.fill('absent'); await assertStable();
      await search.fill('same name'); await page.getByRole('checkbox').first().check(); await page.getByRole('checkbox').last().check(); await assertStable();
      await search.fill(''); await choose(page, 'Date basis', 'Published date'); await assertStable();
      await page.getByLabel('From', { exact: true }).fill('2026-09-16'); await page.getByLabel('Through', { exact: true }).fill('2026-09-15');
      await assertStable(); await expect(page.getByRole('button', { name: 'Apply filters', exact: true })).toBeDisabled();
      await expect(panel.getByRole('alert')).toContainText('on or after');
      await page.locator('.filter-panel-body').evaluate((node) => { node.scrollTop = node.scrollHeight; });
      await page.getByRole('button', { name: 'Date basis', exact: true }).click();
      const menu = (await page.getByRole('listbox', { name: 'Date basis', exact: true }).boundingBox())!;
      expect(menu.x).toBeGreaterThanOrEqual(0); expect(menu.x + menu.width).toBeLessThanOrEqual(width); expect(menu.y + menu.height).toBeLessThanOrEqual(800);
      await assertStable(); await page.keyboard.press('Escape');
      const apply = (await page.getByRole('button', { name: 'Apply filters', exact: true }).boundingBox())!;
      expect(apply.y).toBeGreaterThanOrEqual(0); expect(apply.y + apply.height).toBeLessThanOrEqual(800);
      await page.screenshot({ path: resolve('.output/handoff-c1-' + surface + '-' + width + '.png'), animations: 'disabled' });
      await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
      await search.fill('same name'); await page.getByRole('checkbox').first().check(); await page.getByRole('checkbox').last().check();
      await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
      await expect(page.locator('.filter-count')).toHaveText('Active filter groups: 1');
      expect(await trigger.boundingBox()).toEqual(anchor);
      await page.getByRole('button', { name: 'Reset view', exact: true }).filter({ visible: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.close();
  });

  test(surface + ': unavailability removes draft controls and fresh eligibility starts clean', async () => {
    const page = await open('library', true, surface);
    const trigger = page.getByRole('button', { name: 'Filter library', exact: true });
    await trigger.click(); await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
    await change(page, 'snapshot-error');
    await expect(page.getByRole('dialog', { name: 'Filters', exact: true })).toHaveCount(0); await expect(trigger).toBeDisabled();
    await expect(page.locator('.active-filters')).toHaveCount(0);
    await change(page, 'library'); await trigger.click();
    await expect(page.getByRole('checkbox', { name: 'Travel', exact: true })).not.toBeChecked();
    await page.close();
  });

  test(surface + ': Reset view restores the whole local view including focused detail', async () => {
    const page = await open('library', true, surface);
    await page.setViewportSize({ width: surface === 'options' ? 1440 : 360, height: 900 });
    await expect(page.locator('.video-row')).toHaveCount(50);
    const reset = page.getByRole('button', { name: 'Reset view', exact: true }).filter({ visible: true });
    await expect(reset).toBeDisabled(); await expect(reset).toHaveAttribute('title', 'Reset search, filters, sort and current view');
    await change(page, 'library', 360);
    await page.getByLabel('Search library').fill('video'); await choose(page, 'Duration', '20 minutes or longer'); await choose(page, 'Sort', 'Title A–Z');
    await page.getByRole('button', { name: 'Filter library', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Travel', exact: true }).check(); await page.getByRole('checkbox', { name: 'Music', exact: true }).check();
    await choose(page, 'Date basis', 'Published date'); await page.getByLabel('From', { exact: true }).fill('2026-09-15');
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await page.getByRole('button', { name: 'Next page' }).click(); await page.locator('.video-row').first().click();
    if (surface === 'sidepanel') await page.getByRole('button', { name: 'View details', exact: true }).click();
    else await page.getByRole('button', { name: 'Sort', exact: true }).click();
    const account = await page.locator('.connection').textContent();
    const sync = await page.locator('.sync-primary').textContent();
    const calls = await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls]);
    await reset.click();
    await expect(page.getByLabel('Search library')).toHaveValue(''); await expect(page.getByRole('button', { name: 'Duration', exact: true })).toContainText('Any duration');
    await expect(page.getByRole('button', { name: 'Sort', exact: true })).toContainText('Liked newest');
    await expect(page.getByText('Page 1 of 8')).toBeVisible(); await expect(page.locator('.video-row')).toHaveCount(50);
    await expect(page.locator('.video-row[aria-pressed="true"], .video-row[aria-expanded="true"]')).toHaveCount(0);
    await expect(page.locator('.active-filters, .single-select-menu, .filter-panel')).toHaveCount(0);
    await expect(page.locator('.selection-notice')).toHaveText('');
    await expect(reset).toBeDisabled();
    await expect(page.getByLabel('Search library')).toBeFocused();
    expect(await page.locator('.results-scroll').evaluate((node) => node.scrollTop)).toBe(0);
    expect(await page.locator('.connection').textContent()).toBe(account); expect(await page.locator('.sync-primary').textContent()).toBe(sync);
    expect(await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls])).toEqual(calls);
    await page.getByRole('button', { name: 'Filter library', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search channels', exact: true })).toHaveValue('');
    await expect(page.getByRole('checkbox', { name: 'Travel', exact: true })).not.toBeChecked(); await expect(page.getByLabel('From', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Date basis', exact: true })).toContainText('Liked date');
    await page.close();
  });

  for (const label of ['Duration', 'Sort', 'Date basis']) {
    test(surface + ': themed ' + label + ' supports keyboard choice, selection, dismissal and Tab exit', async () => {
      const page = await open('library', true, surface);
      await page.setViewportSize({ width: surface === 'options' ? 1440 : 360, height: 900 });
      if (label === 'Date basis') await page.getByRole('button', { name: 'Filter library', exact: true }).click();
      const trigger = page.getByRole('button', { name: label, exact: true });
      await trigger.focus(); await page.keyboard.press('Enter');
      const menu = page.getByRole('listbox', { name: label, exact: true });
      await expect(menu).toBeFocused(); await expect(menu.locator('[aria-selected="true"]')).toHaveAttribute('data-active', 'true');
      await expect(menu.locator('[aria-selected="true"] svg')).toHaveCount(1);
      await expect(page.locator('select')).toHaveCount(0);
      const bounds = (await menu.boundingBox())!, anchor = (await trigger.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(anchor.width); expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width); expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
      await menu.getByRole('option').last().hover();
      await expect(menu.locator('[aria-selected="true"] svg')).toHaveCount(1);
      await page.keyboard.press('End'); await expect(menu.getByRole('option').last()).toHaveAttribute('data-active', 'true');
      await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space');
      await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused();
      await trigger.click(); await expect(menu.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Home'); await page.keyboard.press('Enter'); await expect(trigger).toBeFocused();
      await trigger.click(); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
      await trigger.click();
      if (label === 'Date basis') await page.getByRole('heading', { name: 'Date', exact: true }).click(); else await page.locator('h1').click();
      await expect(menu).toHaveCount(0);
      await trigger.click(); await page.keyboard.press('Tab'); await expect(menu).toHaveCount(0); await expect(trigger).not.toBeFocused();
      if (label === 'Date basis') await expect(page.getByRole('dialog', { name: 'Filters', exact: true })).toBeVisible();
      await page.close();
    });
  }
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
  await page.getByLabel('Search library').fill('video');
  await choose(page, 'Duration', '4 to under 20 minutes');
  await expect(rows).toHaveCount(21);
  await page.getByText('Filter library', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Travel', exact: true }).check(); await expect(rows).toHaveCount(21);
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await expect(rows).toHaveCount(10);
  await choose(page, 'Sort', 'Duration longest');
  await page.getByText('Filter library', { exact: true }).click();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await expect(rows).toHaveCount(21);
  await choose(page, 'Duration', 'Any duration'); await expect(rows).toHaveCount(50);
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
  await page.keyboard.press('Escape');
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
  await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Music', exact: true }).check();
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.getByText('Filter library', { exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.locator('.filter-trigger')).toBeFocused();
  await expect(page.locator('.filter-panel')).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
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
  await choose(page, 'Sort', 'Duration shortest');
  await choose(page, 'Duration', '4 to under 20 minutes');
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
  await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await choose(page, 'Duration', '4 to under 20 minutes');
  await choose(page, 'Sort', 'Title A–Z');
  await expect(page.locator('.video-row')).toHaveCount(10);
  for (let number = 3; number <= 6; number++) {
    await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.holdReads());
    for (const [count, phase] of [[number - 1, 'applying'], [number, 'applying'], [number, 'scanning']] as const) {
      await page.evaluate(({ count, phase }) => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.progress(count, phase), { count, phase });
      await expect.poll(() => page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.pendingReads())).toBeGreaterThanOrEqual(2);
      await expect(page.locator('.video-row')).toHaveCount(10);
      await expect(page.getByLabel('Search library')).toBeEnabled();
      await expect(page.locator('.filter-trigger')).toBeEnabled();
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
    await page.getByText('Filter library', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
    await page.evaluate((boundary) => {
      const h = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest;
      h.holdReads(); h.invalidate(boundary);
    }, boundary);
    await expect(page.locator('.video-row')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'My channel' })).toHaveCount(0);
    await expect(page.getByLabel('Search library')).toBeDisabled();
    await expect(page.locator('.filter-panel')).toHaveCount(0); await expect(page.locator('.active-filters')).toHaveCount(0);
    await expect(page.locator('.filter-trigger')).toBeDisabled();
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
