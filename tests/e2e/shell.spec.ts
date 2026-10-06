import console from 'node:console';
import { resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { requestSchema, responseSchema, resultSchemas, type RuntimeOperation } from '@/src/runtime/contracts';
import { attempt, NEXT_ATTEMPT_ID, OBSERVED, owner, success, video } from '../fixtures/storage';

test('Production extension loads shells, typed runtime, approved gate and restarted worker', async () => {
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
      await expect(page.getByRole('heading', { name: 'Find that video again.' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Connect YouTube', exact: true })).toBeDisabled();
      if (surface === 'Side Panel') await expect(page.locator('.compact-app')).toBeVisible();
    }
    expect(errors).toEqual([]);
    // This checks the real browser API configuration, not native toolbar clicking.
    await expect.poll(() => worker.evaluate(() =>
      (globalThis as unknown as { chrome: typeof browser }).chrome.sidePanel.getPanelBehavior(),
    )).toEqual({ openPanelOnActionClick: false });

    // Both surfaces have live observers. Isolate deliberate worker stops and
    // synthetic recovery data from concurrent UI authorization/status requests.
    await page.goto(`${origin}/manifest.json`);

    const send = async (operation: RuntimeOperation) => {
      const request = requestSchema.parse({ protocolVersion: 1, requestId: crypto.randomUUID(), operation, payload: {} });
      const response = responseSchema.parse(await page.evaluate((message) =>
        (globalThis as unknown as { chrome: typeof browser }).chrome.runtime.sendMessage(message), request));
      expect(response.requestId).toBe(request.requestId);
      expect(response.operation).toBe(operation);
      if (response.ok) resultSchemas[operation].parse(response.result);
      return response;
    };
    expect(await send('AUTH_STATUS_GET')).toMatchObject({ ok: true, result: { status: 'auth-required' } });
    expect(await send('LIBRARY_SNAPSHOT_GET')).toMatchObject({ ok: true, result: { videos: [], owner: null, sync: null } });
    const before = await send('SYNC_STATUS_GET');
    expect(await send('SYNC_START')).toMatchObject({ ok: false, error: { code: 'auth-error', detail: { category: 'authentication' } } });
    const after = await send('SYNC_STATUS_GET');
    if (!before.ok || !after.ok) throw new Error('Runtime status unavailable');
    expect(after.result).toEqual(before.result);
    const invalid = responseSchema.parse(await page.evaluate(() =>
      (globalThis as unknown as { chrome: typeof browser }).chrome.runtime.sendMessage({ operation: 'PRUNE', complete: true })));
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-request' } });

    // Stop the real worker (not just reload a page) and revive it by messaging.
    const cdp = await context.newCDPSession(page);
    let versionId: string | undefined;
    let runningStatus: string | undefined;
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      const version = versions.find((version) => version.scriptURL === worker.url());
      versionId = version?.versionId ?? versionId;
      runningStatus = version?.runningStatus ?? runningStatus;
    });
    await cdp.send('ServiceWorker.enable');
    await expect.poll(() => versionId).toBeTruthy();
    await cdp.send('ServiceWorker.stopWorker', { versionId: versionId! });
    await expect.poll(() => runningStatus).toBe('stopped');
    expect(await send('AUTH_STATUS_GET')).toMatchObject({ ok: true, result: { status: 'auth-required' } });
    await expect.poll(() => runningStatus).toBe('running');
    expect(await send('SYNC_START')).toMatchObject({ ok: false, error: { code: 'auth-error', detail: { category: 'authentication' } } });

    // Test-only synthetic persisted truth in the real browser IndexedDB. The
    // production bundle has no fixture path or provider enablement switch.
    const seed = { owner: owner(), videos: [video()], sync: { currentAttempt: attempt({ attemptId: NEXT_ATTEMPT_ID }),
      previousCompletedResult: attempt({ state: 'success', finishedAt: OBSERVED }), latestSuccessfulSync: success(),
      lastMirrorChangeRevision: 0, lastFinalizedMirrorRevision: 0 } };
    await page.evaluate(async (data) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('likedex'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['owner', 'videos', 'sync', 'control'], 'readwrite');
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        tx.objectStore('owner').put(data.owner, 'singleton');
        data.videos.forEach((record) => tx.objectStore('videos').put(record));
        tx.objectStore('sync').put(data.sync, 'singleton');
        const control = tx.objectStore('control').get('singleton');
        control.onsuccess = () => tx.objectStore('control').put({ ...control.result, connectionGate: 'connected' }, 'singleton');
      });
      db.close();
    }, seed);
    await cdp.send('ServiceWorker.stopWorker', { versionId: versionId! });
    await expect.poll(() => runningStatus).toBe('stopped');
    // Invalid messaging wakes startup without requesting authorization or sync.
    expect(responseSchema.parse(await page.evaluate(() =>
      (globalThis as unknown as { chrome: typeof browser }).chrome.runtime.sendMessage({ operation: 'PRUNE' }))))
      .toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    const readSync = () => page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('likedex'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
      });
      const value: unknown = await new Promise((resolve, reject) => {
        const read = db.transaction('sync').objectStore('sync').get('singleton');
        read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error);
      });
      db.close(); return value;
    });
    await expect.poll(readSync).toMatchObject({ currentAttempt: { attemptId: NEXT_ATTEMPT_ID, state: 'interrupted' },
      latestSuccessfulSync: success() });
    expect(errors).toEqual([]);
    await cdp.detach();
  } finally {
    await context.close();
  }
});
