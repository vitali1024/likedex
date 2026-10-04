import { resolve } from 'node:path';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect, test } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { channelResponse, TOKEN_A } from '../fixtures/authentication';
import { member, membershipPage, metadata, videosPage } from '../fixtures/provider';
import { attempt, OBSERVED, owner, success, video } from '../fixtures/storage';

test('separate validation package uses Options Connect, observes without writes, and keeps production Sync closed', async () => {
  const extensionPath = resolve('.output/provider-validation-test-composition');
  await cp(resolve('.output/provider-validation/chrome-mv3'), extensionPath, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(extensionPath, 'manifest.json'), 'utf8'));
  manifest.name = 'Likedex — provider validation TEST COMPOSITION';
  await writeFile(resolve(extensionPath, 'manifest.json'), JSON.stringify(manifest));
  // The request adapter captures fetch during composition. Install synthetic
  // boundaries before startup in a separate TEST copy, never the human package.
  const fixtures = { token: TOKEN_A, channel: channelResponse(), first: membershipPage([member()], 'synthetic-next', 2),
    second: membershipPage([member(2)], undefined, 2), metadataFirst: videosPage(), metadataSecond: videosPage([metadata(2)]) };
  const prelude = `(() => {
    chrome.runtime.onConnect.addListener((port) => { globalThis.validationTestSender = { id: port.sender?.id, url: port.sender?.url, hasTab: port.sender?.tab !== undefined }; });
    const fixtures = ${JSON.stringify(fixtures)};
    chrome.identity.getAuthToken = async () => ({ token: fixtures.token, grantedScopes: ['https://www.googleapis.com/auth/youtube.readonly'] });
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const body = url.pathname.endsWith('/channels') ? fixtures.channel
        : url.pathname.endsWith('/playlistItems') ? url.searchParams.has('pageToken') ? fixtures.second : fixtures.first
        : url.pathname.endsWith('/videos') ? url.searchParams.get('id')?.includes('0000000002') ? fixtures.metadataSecond : fixtures.metadataFirst
        : undefined;
      if (!body) throw new Error('Unexpected test request category.');
      return new Response(JSON.stringify(body), { status: 200 });
    };
  })();\n`;
  await writeFile(resolve(extensionPath, 'background.js'), prelude + await readFile(resolve(extensionPath, 'background.js'), 'utf8'));
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).hostname;
    expect(id).toBe('mmefiakgfhddiojfdnkfpfpbkgbfgkgj');
    const origin = `chrome-extension://${id}`;
    const options = await context.newPage();
    await options.goto(`${origin}/options.html`);
    await expect(options.getByText('DEVELOPMENT / RELEASE VALIDATION ONLY', { exact: true })).toBeVisible();
    await expect(options.getByRole('button', { name: 'Connect YouTube', exact: true })).toBeDisabled();
    await options.getByRole('checkbox').check();
    await options.getByRole('button', { name: 'Connect YouTube', exact: true }).click();
    await expect(options.getByText('YouTube connected · read-only')).toBeVisible();
    await options.getByRole('link', { name: 'open non-destructive provider observation' }).click();
    const page = options;
    await expect(page.getByRole('heading', { name: 'DEVELOPMENT / RELEASE VALIDATION ONLY' })).toBeVisible();
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    // Seed previous success plus unrelated membership through test-only browser
    // code. No test adapter is shipped in either extension package.
    await page.evaluate(async (seed) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('likedex'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['owner', 'videos', 'sync'], 'readwrite');
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        tx.objectStore('owner').put(seed.owner, 'singleton');
        tx.objectStore('videos').put(seed.video);
        tx.objectStore('sync').put(seed.sync, 'singleton');
      }); db.close();
    }, { owner: owner(), video: video('unrelated-membership'), sync: { currentAttempt: attempt({ state: 'success', finishedAt: OBSERVED, authEpoch: 1 }),
      previousCompletedResult: null, latestSuccessfulSync: success(), lastMirrorChangeRevision: 0, lastFinalizedMirrorRevision: 0 } });
    const raw = () => page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('likedex'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const rows = await Promise.all(['control', 'owner', 'videos', 'sync'].map((store) => new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      }))); db.close(); return rows;
    });
    const before = await raw();
    await page.getByRole('button', { name: 'Observe provider without syncing' }).click();
    await expect.poll(() => worker.evaluate(() => (globalThis as unknown as { validationTestSender: unknown }).validationTestSender)).toEqual({ id, url: `${origin}/provider-validation.html`, hasTab: true });
    await expect(page.getByText('Observation succeeded with genuine trusted provider completion.', { exact: false })).toBeVisible();
    const evidence = JSON.parse((await page.locator('pre').textContent())!);
    expect(evidence).toMatchObject({ status: 'success', summary: { trustedCompletion: true, pages: 2, rawMemberships: 2, hydrated: 2, productionSyncGate: 'closed' } });
    expect(JSON.stringify(evidence)).not.toContain(TOKEN_A);
    expect(await raw()).toEqual(before);
    const gate = await page.evaluate(() => (globalThis as unknown as { chrome: typeof browser }).chrome.runtime.sendMessage({
      protocolVersion: 1, requestId: crypto.randomUUID(), operation: 'SYNC_START', payload: {},
    }));
    expect(gate).toMatchObject({ ok: false, error: { code: 'provider-validation-required' } });
    expect(await raw()).toEqual(before);
    await page.clock.install();
    await page.clock.fastForward(600_001);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('The temporary evidence view expired.', { exact: false })).toBeVisible();
    await expect(page.locator('pre')).toHaveCount(0);
    expect(await raw()).toEqual(before);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
