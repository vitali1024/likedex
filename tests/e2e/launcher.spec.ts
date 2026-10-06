import { resolve } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { browser } from 'wxt/browser';

let context: BrowserContext;
let origin: string;
test.beforeAll(async () => {
  const path = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`] });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  origin = `chrome-extension://${new URL(worker.url()).hostname}`;
});
test.afterAll(async () => { await context?.close(); });

type Scenario = 'closed' | 'open' | 'other-window' | 'query-failure' | 'open-failure' | 'close-failure' | 'pending';
async function open(scenario?: Scenario) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 360, height: 420 });
  if (scenario) await page.addInitScript((mode) => {
    // Test-only boundary injection into a real production popup page. No fixture
    // imports, test switches or fake APIs are built into the shipped artifact.
    const chrome = (globalThis as unknown as { chrome: typeof browser }).chrome;
    window.close = () => {}; // Keep this test page mounted to inspect outcomes.
    const calls: { name: string; args: unknown }[] = [];
    let panelOpen = mode === 'open' || mode === 'close-failure';
    let queryPending = mode === 'pending';
    const control = { calls, fail: mode.endsWith('failure'), release: () => {}, panelOpen: () => panelOpen };
    Object.assign(window, { launcherTest: control });
    chrome.windows.getCurrent = (async () => ({ id: 7 })) as typeof chrome.windows.getCurrent;
    chrome.runtime.getContexts = (async (filter: unknown) => {
      calls.push({ name: 'contexts', args: filter });
      if (mode === 'query-failure' && control.fail) throw new Error('private raw error sentinel');
      if (queryPending) await new Promise<void>((resolve) => { control.release = () => { queryPending = false; resolve(); }; });
      return panelOpen || mode === 'other-window' ? [{ contextType: 'SIDE_PANEL', windowId: mode === 'other-window' ? 8 : 7,
        documentUrl: chrome.runtime.getURL('/sidepanel.html') }] : [];
    }) as typeof chrome.runtime.getContexts;
    chrome.sidePanel.open = (async (args: unknown) => {
      calls.push({ name: 'open', args });
      if (mode === 'open-failure' && control.fail) throw new Error('private raw error sentinel');
      panelOpen = true;
    }) as typeof chrome.sidePanel.open;
    chrome.sidePanel.close = (async (args: unknown) => {
      calls.push({ name: 'close', args });
      if (mode === 'close-failure' && control.fail) throw new Error('private raw error sentinel');
      panelOpen = false;
    }) as typeof chrome.sidePanel.close;
    chrome.runtime.openOptionsPage = (async () => { calls.push({ name: 'options', args: null }); }) as typeof chrome.runtime.openOptionsPage;
    chrome.extension.getViews = ((filter: { windowId: number; type?: 'tab' }) => filter.type === 'tab' || !panelOpen ? []
      : [{ location: { href: chrome.runtime.getURL('/sidepanel.html') }, document: { visibilityState: 'visible' } }]) as unknown as typeof chrome.extension.getViews;
    chrome.runtime.sendMessage = (() => { throw new Error('Launcher must not request app data'); }) as typeof chrome.runtime.sendMessage;
    chrome.runtime.connect = (() => { throw new Error('Launcher must not observe app data'); }) as typeof chrome.runtime.connect;
  }, scenario);
  await page.goto(`${origin}/popup.html`);
  return page;
}
async function calls(page: Page) {
  return page.evaluate(() => (window as unknown as { launcherTest: { calls: { name: string; args: unknown }[] } }).launcherTest.calls);
}

test('real production launcher mounts with exactly two destinations and native Full Library opens', async () => {
  const page = await open(); const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('button', { name: 'Open Side Panel', exact: true })).toBeEnabled();
  await expect(page.getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Likedex', exact: true })).toBeVisible();
  await expect(page.getByText('Your likes, within reach.')).toBeVisible();
  await expect(page.locator('input, select, .video-row, .sync-status, .detail, footer')).toHaveCount(0);
  const assets = await page.locator('img').evaluateAll((images) => images.map((image) => ({ loaded: image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0, src: image.getAttribute('src') })));
  expect(assets).toHaveLength(3); expect(assets.every((asset) => asset.loaded)).toBe(true);
  expect(assets[0]?.src).toBe('/brand/likedex-mark-vector.svg');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.launcher').screenshot({ path: resolve('.output/launcher.png') });
  const optionsOpened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open Full Library', exact: true }).click();
  const options = await optionsOpened;
  await expect(options).toHaveURL(`${origin}/options.html`);
  await expect(options.getByRole('heading', { name: 'Likedex', exact: true })).toBeVisible();
  expect(errors).toEqual([]); await options.close(); await page.close();
});

test('real Chrome Open/Close, reopening and two-window state work without a stored toggle', async () => {
  const page = await open();
  const control = await context.newPage(); await control.goto(`${origin}/manifest.json`);
  const realContexts = () => control.evaluate(() => (globalThis as unknown as { chrome: typeof browser }).chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }));
  await expect(page.getByRole('button', { name: 'Open Side Panel', exact: true })).toBeEnabled();
  const dismissed = page.waitForEvent('close');
  await page.getByRole('button', { name: 'Open Side Panel', exact: true }).click(); await dismissed;
  await expect.poll(realContexts).toHaveLength(1);
  const reopened = await open();
  await expect(reopened.getByRole('button', { name: 'Close Side Panel', exact: true })).toBeEnabled();
  // Create another actual Chrome window, not a fabricated window ID.
  const newPage = context.waitForEvent('page');
  const otherWindow = await control.evaluate((url) => (globalThis as unknown as { chrome: typeof browser }).chrome.windows.create({ url }), `${origin}/popup.html`);
  const other = await newPage;
  await expect(other.getByRole('button', { name: 'Open Side Panel', exact: true })).toBeEnabled();
  // A tab at the real panel path in that window must not impersonate a panel.
  const tabPage = context.waitForEvent('page');
  await other.evaluate(({ windowId, url }) => (globalThis as unknown as { chrome: typeof browser }).chrome.tabs.create({ windowId, url }),
    { windowId: otherWindow?.id, url: `${origin}/sidepanel.html` });
  const panelTab = await tabPage;
  await other.reload();
  await expect(other.getByRole('button', { name: 'Open Side Panel', exact: true })).toBeEnabled();
  await panelTab.close();
  await reopened.bringToFront();
  const closeDismissed = reopened.waitForEvent('close');
  await reopened.getByRole('button', { name: 'Close Side Panel', exact: true }).click(); await closeDismissed;
  await expect.poll(realContexts).toHaveLength(0);
  const closed = await open();
  await expect(closed.getByRole('button', { name: 'Open Side Panel', exact: true })).toBeEnabled();
  await closed.close(); await other.close(); await control.close();
});

test('current-window closed → open → close uses scoped APIs and fresh browser queries', async () => {
  const page = await open('closed');
  await page.getByRole('button', { name: 'Open Side Panel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close Side Panel', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Close Side Panel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Side Panel', exact: true })).toBeEnabled();
  const observed = await calls(page);
  expect(observed.filter((call) => call.name === 'open' || call.name === 'close')).toEqual([
    { name: 'open', args: { windowId: 7 } }, { name: 'close', args: { windowId: 7 } },
  ]);
  const queries = observed.filter((call) => call.name === 'contexts'); expect(queries).toHaveLength(6);
  queries.forEach((call, index) => expect(call.args).toEqual({ contextTypes: ['SIDE_PANEL'], windowIds: [index % 2 === 0 ? 7 : -1], documentUrls: [`${origin}/sidepanel.html`] }));
  await page.close();
});

test('another-window Side Panel does not set Close in this window', async () => {
  const page = await open('other-window');
  await expect(page.getByRole('button', { name: 'Open Side Panel', exact: true })).toBeEnabled();
  await page.close();
});

test('query failure leaves a mounted truthful launcher and independent Full Library', async () => {
  const page = await open('query-failure');
  await expect(page.getByRole('button', { name: 'Side Panel unavailable', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveText('Could not check the Side Panel. Reopen the launcher to retry.');
  await expect(page.getByText('private raw error sentinel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Full Library', exact: true }).click();
  expect(await calls(page)).toContainEqual({ name: 'options', args: null });
  await page.close();
});

for (const mode of ['open-failure', 'close-failure'] as const) test(`${mode} preserves label, sanitizes error and permits retry`, async () => {
  const page = await open(mode); const action = mode === 'open-failure' ? 'Open' : 'Close';
  await page.getByRole('button', { name: `${action} Side Panel`, exact: true }).click();
  await expect(page.getByRole('button', { name: `${action} Side Panel`, exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveText(`Could not ${action.toLowerCase()} the Side Panel. Try again.`);
  await page.evaluate(() => { (window as unknown as { launcherTest: { fail: boolean } }).launcherTest.fail = false; });
  await page.getByRole('button', { name: `${action} Side Panel`, exact: true }).click();
  await expect(page.getByRole('button', { name: `${action === 'Open' ? 'Close' : 'Open'} Side Panel`, exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0); await page.close();
});

test('keyboard order, visible focus, native buttons, and border-free image slots', async () => {
  const page = await open('closed');
  const panel = page.getByRole('button', { name: 'Open Side Panel', exact: true });
  const library = page.getByRole('button', { name: 'Open Full Library', exact: true });
  await expect(panel).toBeEnabled(); await page.keyboard.press('Tab'); await expect(panel).toBeFocused();
  expect(await panel.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.keyboard.press('Tab'); await expect(library).toBeFocused();
  await page.keyboard.press('Enter'); expect(await calls(page)).toContainEqual({ name: 'options', args: null });
  await expect(page.getByRole('switch')).toHaveCount(0);
  expect(await panel.evaluate((element) => element.tagName)).toBe('BUTTON');
  const icons = await page.locator('.launcher-row-icon').evaluateAll((images) => images.map((image) => {
    const css = getComputedStyle(image); return { width: css.width, height: css.height, border: css.borderTopWidth, shadow: css.boxShadow };
  }));
  expect(icons).toEqual(Array.from({ length: 2 }, () => ({ width: '48px', height: '48px', border: '0px', shadow: 'none' })));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await panel.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.close();
});

test('unresolved state is disabled/busy and Full Library stays available', async () => {
  const page = await open('pending');
  const pending = page.getByRole('button', { name: 'Checking Side Panel…', exact: true });
  await expect(pending).toBeDisabled(); await expect(pending).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('button', { name: 'Open Full Library', exact: true })).toBeEnabled();
  await page.evaluate(() => { (window as unknown as { launcherTest: { release(): void } }).launcherTest.release(); });
  await expect(page.getByRole('button', { name: 'Open Side Panel', exact: true })).toBeEnabled();
  await page.close();
});
