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
  test(`${surface}: icon controls retain keyboard details, real status visuals and the separate Sync action`, async () => {
    const page = await open('library', true, surface);
    await page.setViewportSize({ width: surface === 'sidepanel' ? 320 : 1440, height: 800 });
    const account = page.locator('.header-account summary'), sync = page.locator('.header-sync summary');
    await expect(account).toHaveAttribute('title', 'Connected');
    await expect(sync).toHaveAttribute('title', 'Sync complete');
    await page.locator('.brand').click(); await page.keyboard.press('Tab'); await expect(account).toBeFocused();
    await expect(account).toHaveCSS('outline-style', 'solid');
    await account.press('Space');
    await expect(page.locator('.header-account .disclosure-content')).toBeVisible();
    await expect(page.locator('.header-account .status-facts')).toContainText('My channel');
    await expect(page.locator('.header-account .status-facts')).toContainText('Read-only');
    await page.keyboard.press('Escape'); await expect(account).toBeFocused();
    await page.keyboard.press('Tab'); await expect(sync).toBeFocused(); await sync.press('Enter');
    await expect(page.locator('.header-sync .sync-details-summary')).toHaveText('Sync complete');
    await expect(page.locator('.header-sync .disclosure-content')).toContainText('Updated');
    await expect(page.locator('.header-sync .disclosure-content time')).not.toHaveCount(0);
    await page.keyboard.press('Escape'); await expect(sync).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Sync', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls.filter((call) => call === 'SYNC_START').length)).toBe(1);
    await change(page, 'active');
    await expect(sync).toHaveAccessibleName('Sync in progress — Scanning liked videos');
    await expect(sync.locator('.status-glyph > .icon')).toHaveClass('icon spinning');
    await expect(sync).toHaveCSS('animation-name', 'none');
    await expect(sync.locator('.status-glyph')).toHaveCSS('animation-name', 'none');
    await expect(sync.locator('[data-badge="check"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sync in progress', exact: true })).toBeDisabled();
    await expect(page.locator('main > .sync-status').getByRole('progressbar')).toBeVisible();
    await page.screenshot({ path: resolve(`.output/status-header-canonical-${surface}-active.png`), animations: 'disabled' });
    await checkpoint(page, { state: 'success', finishedAt: OBSERVED });
    await expect(sync).toHaveAccessibleName(/Sync complete — Updated/);
    await expect(sync.locator('[data-badge="check"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeEnabled();
    await change(page, 'later-failure'); await expect(sync).toHaveAccessibleName('Sync failed');
    await expect(sync.locator('[data-badge="error"]')).toHaveCount(1);
    await change(page, 'mismatch'); await expect(account).toHaveAccessibleName('Connection needs attention');
    await expect(account.locator('[data-badge="warning"]')).toHaveCount(1);
    await change(page, 'disconnected'); await expect(account).toHaveAccessibleName('Not connected');
    await expect(account.locator('.status-glyph')).toHaveAttribute('data-tone', 'disconnected');
    await page.getByRole('button', { name: 'Connect YouTube', exact: true }).click();
    await expect(account).toHaveAccessibleName('Connecting…');
    await expect(account.locator('.status-glyph')).toHaveAttribute('data-tone', 'active');
    await expect(account.locator('.status-glyph > .icon')).toHaveClass('icon spinning');
    await page.clock.runFor(101);
    await expect(account).toHaveAccessibleName('Connected as My channel — Read-only');
    await expect(sync).toHaveAccessibleName('Never synced');
    await expect(sync.locator('.status-glyph')).toHaveAttribute('data-tone', 'idle');
    await expect(sync.locator('.status-badge')).toHaveCount(0);
    await page.close();
  });

}

for (const surface of ['options', 'sidepanel']) {
  test(`${surface}: D+.2 true document remount uses coherent header architecture from first paint`, async () => {
    const records = [];
    for (let cycle = 0; cycle < 5; cycle++) {
      const page = await open('bootstrap', true, surface);
      await page.setViewportSize({ width: surface === 'sidepanel' ? 360 : 1440, height: 800 });
      await expect(page.locator('.app-header')).toBeVisible();
      await expect(page.locator('.header-account summary')).toHaveAccessibleName('Checking connection…');
      await expect(page.locator('.status-rail, .status-overview, main > .connection, main > .sync-status')).toHaveCount(0);
      const initial = (await page.locator('.app-header').boundingBox())!;
      await expect.poll(() => page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.pendingReads())).toBe(2);
      await page.evaluate((authFirst) => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads([
        authFirst ? 'AUTH_STATUS_GET' : 'LIBRARY_SNAPSHOT_GET']), Boolean(cycle % 2));
      if (cycle % 2 === 0) {
        await page.clock.runFor(100);
        await expect(page.locator('.video-row')).toHaveCount(0);
        await expect(page.locator('.header-sync')).toHaveCount(0);
      }
      await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
      await expect(page.locator('.video-row')).toHaveCount(50);
      await expect(page.locator('.header-account summary')).toHaveAccessibleName('Connected as My channel — Read-only');
      await expect(page.locator('.header-sync .sync-heading')).toHaveText('Sync complete');
      const ready = (await page.locator('.app-header').boundingBox())!;
      expect(Math.abs(ready.height - initial.height)).toBeLessThan(2);
      const before = await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls]);
      await page.clock.runFor(2100);
      const observed = await page.evaluate(() => ({ calls: (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls,
        states: (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.renderedStates }));
      expect(observed.calls).toEqual(before);
      expect(observed.states.length).toBeGreaterThan(1);
      expect(observed.states.every((state) => state.header && !state.oldStatus && !state.unavailable && !(state.rows && state.checking))).toBe(true);
      records.push({ cycle, calls: observed.calls, headerHeight: ready.height, states: observed.states });
      await page.close(); // genuine document destruction, not hidden/visible reuse
    }
    await writeFile(resolve(`.output/status-header-canonical-bootstrap-${surface}.json`), JSON.stringify(records, null, 2));
  });

  test(`${surface}: approved status header geometry, semantic fields and stable disclosures`, async () => {
    const page = await open('library', true, surface);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const header = page.locator('.app-header'), account = header.locator('.header-account'), status = header.locator('.header-sync');
    const sizes = surface === 'options' ? [[1440, 900], [1200, 800], [1024, 800], [800, 800]] : [[480, 800], [360, 800], [320, 480]];
    const measurements = [];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width: width!, height: height! });
      await expect(header).toHaveCount(1);
      await expect(page.locator('.status-rail, .status-overview, main > .connection, main > .sync-status')).toHaveCount(0);
      await expect(account.locator('.account-name, .status-chip')).toHaveCount(0);
      await expect(account.locator('summary')).toHaveAccessibleName('Connected as My channel — Read-only');
      await expect(status.locator('summary')).toHaveAccessibleName(/Sync complete — Updated/);
      await expect(header.locator('summary > .icon')).toHaveCount(0);
      await expect(status.locator('summary time, summary .sync-updated')).toHaveCount(0);
      const visible = await header.evaluate((node) => {
        const clone = node.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.sr-only, .disclosure-content').forEach((child) => child.remove());
        return clone.textContent;
      });
      expect(visible).not.toMatch(/My channel|Read-only|Sync complete|Updated/);
      await expect(account.locator('summary')).toHaveAccessibleDescription('Connected to YouTube. Read-only access.');
      await expect(status.locator('.sync-heading')).toHaveText('Sync complete');
      await expect(account.locator('.status-glyph[data-kind="connection"] [data-badge="dot"]')).toHaveCount(1);
      await expect(status.locator('.status-glyph[data-kind="sync"] [data-badge="check"]')).toHaveCount(1);
      await expect(header.locator('[role="status"]')).toHaveCount(1);
      expect(await header.evaluate((node) => (node as HTMLElement).innerText)).not.toMatch(/mirrored|owner-a|YouTube account/);
      const box = (await header.boundingBox())!, search = (await page.getByRole('searchbox').boundingBox())!;
      measurements.push({ width, height, headerTop: box.y, headerBottom: box.y + box.height, headerHeight: box.height,
        searchTop: search.y, firstResultTop: (await page.locator('.video-card').first().boundingBox())!.y });
      expect(box.height).toBe(surface === 'sidepanel' ? 54 : 64);
      const controls = await Promise.all([account.locator('summary'), status.locator('summary'), header.getByRole('button', { name: 'Sync', exact: true }), header.getByRole('button', { name: 'Privacy & terms' })].map((control) => control.boundingBox()));
      const brand = (await header.locator('.brand').boundingBox())!;
      let right = brand.x + brand.width;
      for (const control of controls) {
        expect(control!.x).toBeGreaterThanOrEqual(right);
        expect(control!.height).toBe(36); expect(control!.y).toBe(controls[0]!.y); right = control!.x + control!.width;
      }
      expect(right).toBeCloseTo(box.x + box.width - 4, 0);
      expect(search.y - box.y - box.height).toBeGreaterThanOrEqual(8); expect(search.y - box.y - box.height).toBeLessThanOrEqual(12);
      const actions = (await header.locator('.header-actions').boundingBox())!;
      for (const cluster of [account, status]) {
        const c = (await cluster.boundingBox())!;
        expect(c.x).toBeGreaterThanOrEqual(box.x); expect(c.x + c.width).toBeLessThanOrEqual(box.x + box.width + 1);
        expect(c.y + c.height).toBeLessThanOrEqual(box.y + box.height + 1);
        expect(c.y >= actions.y + actions.height - 1 || c.x + c.width <= actions.x + 1).toBe(true);
      }
      for (const trigger of [account.locator('summary'), status.locator('summary')]) {
        await trigger.focus(); await trigger.press('Enter');
        expect((await header.boundingBox())!.height).toBeCloseTo(box.height, 0);
        expect((await page.getByRole('searchbox').boundingBox())!.y).toBeCloseTo(search.y, 0);
        const popup = trigger.locator('..').locator('.disclosure-content');
        await expect.poll(() => popup.evaluate((node) => {
          const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
        })).toBe(true);
        const d = await popup.evaluate((node) => {
          const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
        expect(d.x).toBeGreaterThanOrEqual(0); expect(d.x + d.width).toBeLessThanOrEqual(width!);
        expect(d.y).toBeGreaterThanOrEqual(0); expect(d.y + d.height).toBeLessThanOrEqual(height!);
        await page.keyboard.press('Escape'); await expect(trigger).toBeFocused(); await page.clock.runFor(250);
      }
      await status.locator('summary').click();
      await expect(page.locator('.header-sync .status-facts > div').filter({ has: page.getByText('Mirrored videos', { exact: true }) })).toHaveText('Mirrored videos2');
      await page.keyboard.press('Escape'); await page.clock.runFor(250);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.locator('.brand').click();
      await page.screenshot({ path: resolve(`.output/status-header-canonical-${surface}-${width}.png`), animations: 'disabled' });
      await header.screenshot({ path: resolve(`.output/status-header-canonical-${surface}-${width}-header.png`), animations: 'disabled' });
    }
    await writeFile(resolve(`.output/status-header-canonical-measurements-${surface}.json`), JSON.stringify(measurements, null, 2));
    await change(page, 'active');
    await expect(page.locator('main > .sync-status').getByRole('progressbar')).toBeVisible();
    await expect(header.getByRole('status')).toContainText('Scanning liked videos');
    await change(page, 'later-failure');
    await expect(page.locator('main > .sync-status').getByRole('alert')).toBeVisible();
    await expect(page.locator('main > .sync-status .sync-prior')).toBeVisible();
    await change(page, 'mismatch'); await expect(header.locator('summary[aria-label^="Connected as"]')).toHaveCount(0);
    await expect(page.locator('.connection [role="alert"]')).toContainText('owner-a');
    await expect(page.locator('.connection [role="alert"]')).toContainText('owner-b');
    await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeDisabled();
    await page.close();
  });
  test(`${surface}: D+.2 header clusters, coherent success details, counts and centered pagination`, async () => {
    const page = await open('active', true, surface);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: surface === 'options' ? 1440 : 360, height: 900 });
    await checkpoint(page, { state: 'success', finishedAt: OBSERVED, rawItems: 200, uniqueMembership: 195, estimatedTotal: 200 });
    const account = page.locator('.header-account'); const status = page.locator('.header-sync');
    await expect(account.locator('summary')).toHaveAccessibleName('Connected as My channel — Read-only');
    await expect(account.locator('dd.channel-id')).toBeHidden();
    await page.screenshot({ path: resolve(`.output/handoff-dplus1-fixture-${surface}-rail.png`), animations: 'disabled' });
    await account.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(account.locator('dd.channel-id')).toHaveText('owner-a');
    await expect(account.locator('.status-facts')).toContainText('Read-only');
    await page.screenshot({ path: resolve(`.output/handoff-dplus-fixture-${surface}-connection.png`) });
    await page.keyboard.press('Escape'); await expect(account.locator('summary')).toBeFocused();
    await status.locator('summary').press('Enter');
    const detail = status.locator('.disclosure-content');
    for (const name of ['Status', 'Scan', 'Library snapshot', 'Changes', 'Timing']) await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Changes', exact: true })).toHaveCount(1);
    await expect(detail).not.toContainText('Current attempt'); await expect(detail).not.toContainText('Last successful snapshot');
    await expect(detail).toContainText('~200'); await expect(detail).toContainText('Refreshed');
    await expect(detail.locator('[role="status"], [role="progressbar"]')).toHaveCount(0);
    await page.screenshot({ path: resolve(`.output/handoff-dplus-fixture-${surface}-sync-details.png`) });
    await page.keyboard.press('Escape'); await expect(page.locator('.header-sync summary')).toBeFocused();
    await page.locator('.count-info summary').focus(); await page.keyboard.press('Enter');
    const counts = page.locator('.count-info .disclosure-content');
    await expect(counts).toBeVisible();
    await expect(counts).toContainText('62 available videos'); await expect(counts).toContainText('62 mirrored memberships');
    await expect(counts.getByText('Availability reflects the last metadata check;', { exact: false })).toHaveCount(1);
    await page.keyboard.press('Escape'); await expect(page.locator('.count-info summary')).toBeFocused();
    await expect(page.locator('.results-footer')).not.toContainText('available videos');
    const footer = await page.locator('.results-footer').boundingBox(), nav = await page.locator('.pagination').boundingBox();
    expect(Math.abs(footer!.x + footer!.width / 2 - nav!.x - nav!.width / 2)).toBeLessThan(2);
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(page.locator('.page-label')).toHaveText('Page 2 of 2');
    await expect(page.locator('.video-row')).toHaveCount(12);
    await change(page, 'later-failure');
    await expect(status).toHaveAttribute('data-tone', 'warning');
    await expect(page.locator('main > .sync-status').getByRole('alert')).toContainText('network request failed');
    await status.locator('summary').click();
    await expect(detail.getByRole('heading', { name: 'Current attempt', exact: true })).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Last successful snapshot', exact: true })).toBeVisible();
    await expect(detail.locator('.sync-detail-event').first()).not.toContainText('Removed');
    await page.close();
  });

  test(`${surface}: D+ primary focus uses one card frame and secondary actions keep their own focus`, async () => {
    const page = await open('library', true, surface);
    await page.setViewportSize({ width: surface === 'options' ? 1440 : 360, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const card = page.locator('.video-card').first(), row = card.locator('.video-row');
    const normal = await card.evaluate((node) => getComputedStyle(node).backgroundImage);
    await row.click(); await expect(card).toHaveAttribute('data-selected', 'true');
    expect(await row.evaluate((node) => node.matches(':focus-visible'))).toBe(false);
    expect(await card.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
    const selected = await card.evaluate((node) => getComputedStyle(node).backgroundImage);
    expect(selected).not.toBe(normal);
    await page.screenshot({ path: resolve(`.output/handoff-dplus-fixture-${surface}-selected.png`) });
    await page.keyboard.press('Tab'); await row.focus();
    expect(await row.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
    expect(await row.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
    expect(await card.evaluate((node) => getComputedStyle(node).outlineWidth)).toBe('2px');
    expect(await card.evaluate((node) => getComputedStyle(node).backgroundImage)).toBe(selected);
    await page.screenshot({ path: resolve(`.output/handoff-dplus-fixture-${surface}-keyboard.png`) });
    const other = page.locator('.video-card').nth(1); await other.locator('.video-row').focus();
    await expect(other).toHaveAttribute('data-selected', 'false');
    expect(await other.evaluate((node) => getComputedStyle(node).outlineWidth)).toBe('2px');
    expect(await other.locator('.video-row').evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
    const actions = surface === 'options' ? card.locator('.detail-actions').locator('button, a') : card.locator('.row-expansion').locator('button, a');
    for (const action of await actions.all()) {
      await action.focus(); await expect(action).toBeFocused();
      expect(await action.evaluate((node) => getComputedStyle(node).outlineWidth)).toBe('2px');
      expect(await card.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none');
    }
    await page.close();
  });

  test(`${surface}: D+ thumbnail stays centered, 16:9 and contained at every supported width`, async () => {
    const page = await open('library', true, surface);
    await page.route('https://i.ytimg.com/**', (route) => route.request().url().includes('v0000000000')
      ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="#234b66"/></svg>' })
      : route.abort());
    await change(page, 'thumbnail-cases');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: surface === 'options' ? 1440 : 480, height: 900 });
    await page.locator('.video-row[data-video-id="v0000000000"]').click();
    if (surface === 'sidepanel') await page.getByRole('button', { name: 'View details', exact: true }).click();
    const thumbnail = page.locator('.thumbnail-large');
    await expect(thumbnail.locator('img')).toBeVisible();
    await expect.poll(() => thumbnail.locator('img').evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(400);
    for (const width of surface === 'options' ? [1440, 1200, 1024, 800] : [480, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const content = await page.locator('.detail-content').boundingBox(), box = await thumbnail.boundingBox();
      const img = await thumbnail.locator('img').boundingBox(), badge = await thumbnail.locator('.duration-badge').boundingBox();
      expect(Math.abs(box!.width - Math.min(content!.width, 640))).toBeLessThan(2);
      expect(Math.abs(box!.x + box!.width / 2 - content!.x - content!.width / 2)).toBeLessThan(2);
      expect(Math.abs(box!.width / box!.height - 16 / 9)).toBeLessThan(.02);
      expect(box!.x).toBeGreaterThanOrEqual(content!.x - 1); expect(box!.x + box!.width).toBeLessThanOrEqual(content!.x + content!.width + 1);
      for (const child of [img!, badge!]) {
        expect(child.x).toBeGreaterThanOrEqual(box!.x - 1); expect(child.y).toBeGreaterThanOrEqual(box!.y - 1);
        expect(child.x + child.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
        expect(child.y + child.height).toBeLessThanOrEqual(box!.y + box!.height + 1);
      }
      expect(await thumbnail.locator('img').evaluate((node) => getComputedStyle(node).objectFit)).toBe('contain');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.locator('.detail')).not.toContainText('Availability is not a guarantee');
      await page.screenshot({ path: resolve(`.output/handoff-dplus-fixture-${surface}-thumbnail-${width}.png`) });
    }
    await page.getByRole('button', { name: 'Back to library', exact: true }).click();
    await page.locator('.video-row[data-video-id="v0000000002"]').click();
    if (surface === 'sidepanel') await page.getByRole('button', { name: 'View details', exact: true }).click();
    await expect(thumbnail.locator('.thumbnail-placeholder')).toBeVisible(); await expect(thumbnail.locator('img')).toHaveCount(0);
    await expect(thumbnail.locator('.duration-badge')).toBeVisible();
    await page.close();
  });

  test(`${surface}: D+ long channel title and status disclosures wrap without overflow`, async () => {
    const page = await open('long-title', true, surface);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of surface === 'options' ? [1440, 1200, 1024, 800] : [480, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('.header-account summary')).toHaveAccessibleName(/^Connected as Very long channel/);
      await expect(page.locator('.header-account summary')).toHaveAccessibleDescription('Connected to YouTube. Read-only access.');
      for (const selector of ['.connection-disclosure', '.sync-disclosure']) {
        await page.locator(`${selector} summary`).click();
        // Wait for responsive layout to settle after each viewport change.
        await expect.poll(() => page.locator(`${selector} .disclosure-content`).evaluate((node) => {
          const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth;
        })).toBe(true);
        const box = await page.locator(`${selector} .disclosure-content`).evaluate((node) => {
          const rect = node.getBoundingClientRect(); return { x: rect.x, width: rect.width };
        });
        expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.keyboard.press('Escape'); await expect(page.locator(`${selector} summary`)).toBeFocused();
      }
    }
    await change(page, 'mismatch');
    await expect(page.locator('summary[aria-label^="Connected as"]')).toHaveCount(0);
    await expect(page.locator('.connection')).toContainText('owner-a'); await expect(page.locator('.connection')).toContainText('owner-b');
    await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeDisabled();
    await page.close();
  });
}

for (const surface of ['options', 'sidepanel']) {
  test(`${surface}: authoritative progress stays mounted across phases and settles into compact success`, async () => {
    const page = await open('active', true, surface);
    await page.setViewportSize({ width: surface === 'sidepanel' ? 360 : 1440, height: 900 });
    const status = page.locator('main > .sync-status');
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
      if (state === 'scanning') await expect(page.locator('.header-sync').getByRole('status')).toContainText('Retrying a temporary request');
      await expect(status.locator('.sync-primary')).not.toContainText('Sync complete');
    }
    await page.clock.fastForward(500);
    await page.screenshot({ path: resolve(`.output/handoff-b-${surface}-active.png`), animations: 'disabled' });
    await checkpoint(page, { state: 'success', retrying: false, finishedAt: OBSERVED, rawItems: 200, uniqueMembership: 195 });
    await expect(bar).toHaveCount(0);
    const primary = page.locator('.header-sync summary');
    await expect(primary).toContainText('Sync complete'); await expect(primary).not.toContainText('mirrored');
    await expect(primary.locator('time')).toHaveCount(0); await expect(primary).toHaveAccessibleName(/Sync complete — Updated/);
    await expect(primary).not.toContainText('pages accepted');
    await expect(status.getByText('Last successful sync:', { exact: false })).toHaveCount(0);
    await expect(page.locator('.video-row')).toHaveCount(50);
    await page.locator('.header-sync summary').click();
    await expect(page.locator('.header-sync .status-facts > div').filter({ has: page.getByText('Pages scanned', { exact: true }) })).toHaveText('Pages scanned3');
    await expect(page.locator('.header-sync .status-facts > div').filter({ has: page.getByText('Unique videos observed', { exact: true }) })).toHaveText('Unique videos observed195');
    await page.keyboard.press('Escape');
    await expect(page.locator('.header-sync summary')).toBeFocused();
    await page.screenshot({ path: resolve(`.output/handoff-b-${surface}-success.png`), animations: 'disabled' });
    await page.close();
  });

  test(`${surface}: unknown total, partial failure, and account details retain truth`, async () => {
    const page = await open('active', true, surface);
    await page.setViewportSize({ width: surface === 'sidepanel' ? 480 : 1024, height: 900 });
    const bar = page.getByRole('progressbar');
    const status = page.locator('main > .sync-status');
    const account = page.getByRole('region', { name: 'YouTube connection' });
    await expect(account.locator('summary[aria-label^="Connected as"]')).toBeVisible();
    await expect(account.locator('summary')).toHaveAccessibleDescription('Connected to YouTube. Read-only access.');
    await expect(account.locator('summary')).toHaveAccessibleName('Connected as My channel — Read-only');
    await expect(account.getByText('owner-a', { exact: true })).not.toBeVisible();
    await account.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(account.getByText('owner-a', { exact: true })).toBeVisible();
    await expect(account.getByText('Read-only', { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); await expect(account.locator('summary')).toBeFocused();
    await checkpoint(page, { state: 'preparing', rawItems: 0, uniqueMembership: 0, estimatedTotal: null });
    await expect(bar).toHaveCount(0); await expect(page.locator('.header-sync').getByRole('status')).toContainText('Checking YouTube access');
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
    await expect(page.locator('main > .sync-status').getByRole('alert')).toContainText('network request failed');
    await expect(status.locator('.notice')).toContainText('partially updated');
    await expect(status.locator('.sync-prior')).toContainText('Last successful sync:');
    await expect(status.locator('.sync-prior')).toContainText('2 mirrored memberships');
    await expect(page.locator('.video-row')).toHaveCount(50);
    await change(page, 'unknown-title');
    await expect(account.locator('summary')).toHaveAccessibleName('Connected as YouTube channel — Read-only');
    await change(page, 'mismatch');
    await expect(page.locator('.connection').getByText('Local library owner:', { exact: false })).toContainText('owner-a');
    await expect(page.locator('.connection').getByText('Connected channel:', { exact: false })).toContainText('owner-b');
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
      await page.locator('.header-sync summary').click();
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

  test(surface + ': Back preserves browsing state and library Reset view restores defaults', async () => {
    const page = await open('library', true, surface);
    await page.setViewportSize({ width: surface === 'options' ? 1200 : 360, height: 900 });
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
    const invokingControl = surface === 'sidepanel' ? page.getByRole('button', { name: 'View details', exact: true }) : page.locator('.video-row').first();
    if (surface === 'sidepanel') await invokingControl.click();
    const account = await page.locator('.header-account').textContent();
    const sync = await page.locator('.header-sync summary').textContent();
    const calls = await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls]);
    const selectedId = await page.locator('.video-row').first().getAttribute('data-video-id');
    await expect(page.getByRole('button', { name: 'Back to library', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset view', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to library', exact: true }).click();
    await page.clock.runFor(20);
    await expect(invokingControl).toBeFocused();
    await expect(page.getByLabel('Search library')).toHaveValue('video');
    await expect(page.getByRole('button', { name: 'Duration', exact: true })).toContainText('20 minutes or longer');
    await expect(page.getByRole('button', { name: 'Sort', exact: true })).toContainText('Title A–Z');
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await expect(page.locator('.video-row[aria-pressed="true"], .video-row[aria-expanded="true"]')).toHaveAttribute('data-video-id', selectedId!);
    await expect(page.locator('.filter-count')).toHaveText('Active filter groups: 2');
    await expect(reset).toBeVisible();
    if (surface === 'options') await page.getByRole('button', { name: 'Sort', exact: true }).click();
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
    expect(await page.locator('.header-account').textContent()).toBe(account); expect(await page.locator('.header-sync summary').textContent()).toBe(sync);
    expect(await page.evaluate(() => [...(window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls])).toEqual(calls);
    await page.getByRole('button', { name: 'Filter library', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search channels', exact: true })).toHaveValue('');
    await expect(page.getByRole('checkbox', { name: 'Travel', exact: true })).not.toBeChecked(); await expect(page.getByLabel('From', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Date basis', exact: true })).toContainText('Liked date');
    await page.close();
  });

  test(surface + ': responsive detail keeps library Reset only in split layout with no duplicate row', async () => {
    const page = await open('library', true, surface);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of surface === 'options' ? [1440, 1200, 800] : [360, 480]) {
      await page.setViewportSize({ width, height: 900 });
      const reset = page.getByRole('button', { name: 'Reset view', exact: true });
      await expect(reset).toBeVisible();
      const row = page.locator('.video-row').first();
      if (surface === 'options' || await row.getAttribute('aria-expanded') !== 'true') await row.click();
      if (surface === 'sidepanel') await page.getByRole('button', { name: 'View details', exact: true }).click();
      await expect(page.locator('.detail-reset-control')).toHaveCount(0);
      if (surface === 'options' && width >= 1280) {
        await expect(page.locator('.results')).toBeVisible();
        await expect(page.getByRole('complementary', { name: 'Video detail' })).toBeVisible();
        await expect(reset).toBeVisible(); await expect(reset).toBeEnabled();
        await page.screenshot({ path: resolve(`.output/detail-navigation-${surface}-${width}.png`), animations: 'disabled' });
        await reset.click(); await page.clock.runFor(20);
        await expect(page.locator('.library')).not.toHaveClass(/detail-open/);
        await expect(page.locator('.video-row[aria-pressed="true"]')).toHaveCount(0);
        await expect(reset).toBeDisabled(); await expect(page.getByLabel('Search library')).toBeFocused();
        continue;
      }
      const back = page.getByRole('button', { name: 'Back to library', exact: true });
      await expect(back).toBeVisible();
      await expect(page.getByRole('button', { name: 'Reset view', exact: true })).toHaveCount(0);
      const header = (await page.locator('.app-header').boundingBox())!;
      const control = (await back.boundingBox())!;
      expect(control.y - (header.y + header.height)).toBeGreaterThanOrEqual(0);
      expect(control.y - (header.y + header.height)).toBeLessThan(24);
      const thumbnail = (await page.locator('.detail .thumbnail-large').boundingBox())!;
      expect(thumbnail.width).toBeLessThanOrEqual(640);
      expect(Math.abs(thumbnail.width / thumbnail.height - 16 / 9)).toBeLessThan(.01);
      expect(thumbnail.y - (control.y + control.height)).toBeCloseTo(12, 0);
      await page.screenshot({ path: resolve(`.output/detail-navigation-${surface}-${width}.png`), animations: 'disabled' });
      await back.click(); await page.clock.runFor(20);
      await expect(reset).toBeVisible();
      await expect(surface === 'sidepanel' ? page.getByRole('button', { name: 'View details', exact: true }) : row).toBeFocused();
    }
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
      if (label === 'Date basis') await page.getByRole('heading', { name: 'Filters', exact: true }).click(); else await page.locator('h1').click();
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
  await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
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
  await expect(page.locator('.header-sync summary')).toContainText('Sync complete');
  expect(await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls.filter((c) => c === 'SYNC_START').length)).toBe(1);
  expect(errors).toEqual([]); await page.close();
});

test('keyboard shortcut, narrow focused detail/Back, page context and no horizontal clipping', async () => {
  const page = await open();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(page.locator('.video-row')).toHaveCount(50);
  await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
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
  await change(page, 'later-failure'); await expect(page.locator('.header-sync .sync-heading')).toHaveText('Sync failed');
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
  await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync in progress', exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const violations: string[] = [];
    (window as unknown as { syncViolations: string[] }).syncViolations = violations;
    new MutationObserver(() => {
      if (!document.querySelector('.video-row')) violations.push('rows disappeared');
      if (document.querySelector<HTMLInputElement>('[aria-label="Search library"]')?.disabled) violations.push('search disabled');
      if (!document.querySelector('summary[aria-label^="Connected as"]')) violations.push('identity disappeared');
      if (document.querySelector('.header-actions button')?.getAttribute('aria-label') !== 'Sync in progress') violations.push('sync became idle');
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
      await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
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
    await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
    await page.getByText('Filter library', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
    await page.evaluate((boundary) => {
      const h = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest;
      h.holdReads(); h.invalidate(boundary);
    }, boundary);
    await expect(page.locator('.video-row')).toHaveCount(0);
    await expect(page.locator('summary[aria-label^="Connected as"]')).toHaveCount(0);
    await expect(page.getByLabel('Search library')).toBeDisabled();
    await expect(page.locator('.filter-panel')).toHaveCount(0); await expect(page.locator('.active-filters')).toHaveCount(0);
    await expect(page.locator('.filter-trigger')).toBeDisabled();
    await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
    await expect(page.getByText('Connected, never synced.', { exact: false })).toBeVisible();
    await expect(page.locator('.video-row')).toHaveCount(0);
    await page.close();
  });
}

test('hidden active surface retains eligible rows, pauses polling and catches up once on visibility plus focus', async () => {
  const page = await open('active');
  await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
  const before = await requestCounts(page);
  await page.evaluate(() => {
    const h = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    h.progress(3, 'applying'); h.holdReads();
  });
  await page.clock.fastForward(10_000);
  expect(await requestCounts(page)).toEqual(before);
  await expect(page.locator('.video-row')).toHaveCount(50);
  await setVisibility(page, 'visible');
  expect(await requestCounts(page)).toEqual({ snapshot: before.snapshot + 1, auth: before.auth + 1 });
  await expect(page.locator('.video-row')).toHaveCount(50);
  await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
  await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
  await expect(page.locator('main > .sync-status')).toContainText('150 memberships scanned');
  await expect(page.locator('.video-row')).toHaveCount(50);
  await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
  expect(await requestCounts(page)).toEqual({ snapshot: before.snapshot + 1, auth: before.auth + 1 });
  await page.clock.fastForward(2000);
  expect(await requestCounts(page)).toEqual({ snapshot: before.snapshot + 2, auth: before.auth + 1 });
  await page.close();
});

async function requestCounts(page: Page) {
  return page.evaluate(() => {
    const calls = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.calls;
    return { snapshot: calls.filter((operation) => operation === 'LIBRARY_SNAPSHOT_GET').length,
      auth: calls.filter((operation) => operation === 'AUTH_STATUS_GET').length };
  });
}
async function setVisibility(page: Page, value: 'hidden' | 'visible') {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
    if (value === 'visible') window.dispatchEvent(new Event('focus'));
  }, value);
}
async function observeLifecycle(page: Page) {
  await page.evaluate(() => {
    const violations: string[] = [];
    (window as unknown as { lifecycleViolations: string[] }).lifecycleViolations = violations;
    new MutationObserver(() => {
      if (!document.querySelector('.video-row')) violations.push('rows disappeared');
      if (document.querySelector<HTMLInputElement>('[aria-label="Search library"]')?.disabled) violations.push('search disabled');
      if (!document.querySelector('summary[aria-label^="Connected as"]')) violations.push('identity disappeared');
      if (document.querySelector('.loading-state')) violations.push('skeleton appeared');
      if (/Loading (local snapshot|sync status|connection status)|Checking YouTube authorization/.test(document.querySelector('main')!.textContent!)) violations.push('loading/checking appeared');
      if (document.querySelector('.empty.error')) violations.push('unavailable/error');
    }).observe(document.querySelector('main')!, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}
async function expectNoLifecycleViolations(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { lifecycleViolations: string[] }).lifecycleViolations)).toEqual([]);
}

for (const surface of ['options', 'sidepanel']) {
  test(`${surface}: five eligible hide/show cycles retain rows, account, Sync and browsing state with zero reads`, async () => {
    const page = await open('library', true, surface);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
    await change(page, 'library', 160);
    await expect(page.locator('.results-heading')).toContainText('160 results');
    await page.getByLabel('Search library').fill('video');
    await page.getByText('Filter library', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'Travel', exact: true }).check();
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await choose(page, 'Sort', 'Title A–Z');
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.locator('.video-row').first().click();
    const selected = await page.locator('.video-card[data-selected="true"] .video-row').getAttribute('data-video-id');
    await page.getByText('Filter library', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'Music', exact: true }).check();
    await page.locator('.results-scroll').evaluate((node) => { node.scrollTop = 300; });
    const scroll = await page.locator('.results-scroll').evaluate((node) => node.scrollTop);
    const chips = await page.locator('.active-filters').textContent();
    const before = await requestCounts(page);
    const rows = await page.locator('.video-row').allTextContents();
    const summary = await page.locator('.header-sync').textContent();
    await observeLifecycle(page);
    for (let i = 0; i < 5; i++) {
      await setVisibility(page, 'hidden'); await page.clock.fastForward(2000); await setVisibility(page, 'visible');
      expect(await requestCounts(page)).toEqual(before);
      expect(await page.locator('.video-row').allTextContents()).toEqual(rows);
      await expect(page.getByLabel('Search library')).toHaveValue('video');
      expect(await page.locator('.video-card[data-selected="true"] .video-row').getAttribute('data-video-id')).toBe(selected);
      expect(await page.locator('.results-scroll').evaluate((node) => node.scrollTop)).toBe(scroll);
      expect(await page.locator('.active-filters').textContent()).toBe(chips);
      await expect(page.getByRole('checkbox', { name: 'Music', exact: true })).toBeChecked();
      expect(await page.locator('.header-sync').textContent()).toBe(summary);
      await expectNoLifecycleViolations(page);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    expect(await requestCounts(page)).toEqual(before);
    await setVisibility(page, 'hidden'); await page.clock.fastForward(3_600_000); await setVisibility(page, 'visible');
    expect(await requestCounts(page)).toEqual(before);
    await expectNoLifecycleViolations(page); await page.close();
  });
  test(`${surface}: hidden active Sync with no revision uses one snapshot catch-up and zero auth reads`, async () => {
    const page = await open('active', true, surface);
    await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
    const before = await requestCounts(page); await observeLifecycle(page);
    await setVisibility(page, 'hidden'); await page.clock.fastForward(10_000);
    expect(await requestCounts(page)).toEqual(before);
    await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.holdReads());
    await setVisibility(page, 'visible');
    expect(await requestCounts(page)).toEqual({ snapshot: before.snapshot + 1, auth: before.auth });
    await expectNoLifecycleViolations(page);
    await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
    await expect(page.locator('.video-row')).toHaveCount(50);
    expect(await requestCounts(page)).toEqual({ snapshot: before.snapshot + 1, auth: before.auth });
    await expectNoLifecycleViolations(page); await page.close();
  });
  test(`${surface}: hidden expiry removes all row/link actions before visible reuse`, async () => {
    const page = await open('library', true, surface);
    await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
    await page.locator('.video-row').first().click();
    await setVisibility(page, 'hidden');
    await page.clock.setSystemTime(new Date('2026-10-16T00:00:00.000Z'));
    await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.holdReads());
    await setVisibility(page, 'visible');
    await expect(page.locator('.video-row')).toHaveCount(0);
    await expect(page.locator('a[href*="youtube.com/watch"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Copy link/ })).toHaveCount(0);
    await expect(page.locator('summary[aria-label^="Connected as"]')).toHaveCount(0);
    await expect(page.getByLabel('Search library')).toBeDisabled();
    await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
    await expect(page.locator('.video-row')).toHaveCount(0); await page.close();
  });
  for (const boundary of ['generation', 'epoch'] as const) {
    test(`${surface}: hidden ${boundary} invalidation never revives old rows or identity`, async () => {
      const page = await open('library', true, surface);
      await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
      await setVisibility(page, 'hidden');
      await page.evaluate((boundary) => {
        const h = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest;
        h.holdReads(); h.invalidate(boundary);
      }, boundary);
      await expect(page.locator('.video-row')).toHaveCount(0);
      await expect(page.locator('summary[aria-label^="Connected as"]')).toHaveCount(0);
      await setVisibility(page, 'visible');
      await expect(page.locator('.video-row')).toHaveCount(0);
      await expect(page.locator('summary[aria-label^="Connected as"]')).toHaveCount(0);
      await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
      await expect(page.getByText('Connected, never synced.', { exact: false })).toBeVisible();
      await expect(page.locator('.video-row')).toHaveCount(0); await page.close();
    });
  }
}

test('Full Library and companion surface retain independent views across browser foreground changes', async () => {
  const full = await open(); const panel = await open('library', true, 'sidepanel');
  await expect(full.locator('summary[aria-label^="Connected as"]')).toBeVisible();
  await expect(panel.locator('summary[aria-label^="Connected as"]')).toBeVisible();
  await observeLifecycle(full); await observeLifecycle(panel);
  const other = await context.newPage(); await other.goto('about:blank');
  const before = await requestCounts(full), panelBefore = await requestCounts(panel);
  const observedVisibility: string[] = [];
  for (let i = 0; i < 5; i++) {
    await other.bringToFront(); observedVisibility.push(await full.evaluate(() => document.visibilityState));
    await full.bringToFront(); observedVisibility.push(await full.evaluate(() => document.visibilityState));
    await expect(full.locator('.video-row')).toHaveCount(50); await expect(panel.locator('.video-row')).toHaveCount(50);
    expect(await requestCounts(full)).toEqual(before); expect(await requestCounts(panel)).toEqual(panelBefore);
    await expectNoLifecycleViolations(full); await expectNoLifecycleViolations(panel);
  }
  console.log('Foreground API visibility states:', observedVisibility.join(', '));
  // Headless Chromium may keep all extension pages visible. Deterministic
  // visibility tests above cover the transition; native Side Panel is manual.
  await setVisibility(full, 'hidden'); await expect(panel.locator('.video-row')).toHaveCount(50);
  await setVisibility(full, 'visible'); expect(await requestCounts(full)).toEqual(before);
  await expectNoLifecycleViolations(full); await expectNoLifecycleViolations(panel);
  await other.close(); await panel.close(); await full.close();
});

test('explicit refresh auth fences a cached library on a dropped context broadcast and late library response', async () => {
  const page = await open();
  await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
  await page.evaluate(() => {
    const h = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest;
    h.holdReads(['LIBRARY_SNAPSHOT_GET']); h.invalidate('generation', false);
  });
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  await expect(page.locator('.video-row')).toHaveCount(0);
  await expect(page.locator('summary[aria-label^="Connected as"]')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
  await expect(page.getByText('Connected, never synced.', { exact: false })).toBeVisible();
  await expect(page.locator('.video-row')).toHaveCount(0);
  await page.close();
});

test('same-context passive auth pending retains eligible identity, but an actual auth failure fences a delayed library reply', async () => {
  const page = await open('active');
  await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
  await page.evaluate(() => {
    const h = (window as unknown as { optionsTest: OptionsTestControl }).optionsTest;
    h.holdReads(['LIBRARY_SNAPSHOT_GET']); h.change('auth-pending');
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.pendingReads())).toBe(1);
  await expect(page.locator('.video-row')).toHaveCount(50);
  await expect(page.locator('summary[aria-label^="Connected as"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync in progress', exact: true })).toBeDisabled();
  await change(page, 'auth-error');
  await expect(page.getByRole('heading', { name: 'Connection status unavailable' })).toBeVisible();
  await expect(page.locator('.video-row')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { optionsTest: OptionsTestControl }).optionsTest.releaseReads());
  await expect(page.getByRole('heading', { name: 'Library unavailable' })).toBeVisible();
  await expect(page.locator('.video-row')).toHaveCount(0);
  await page.close();
});
