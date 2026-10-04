import { resolve } from 'node:path';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect, test } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { channelResponse, TOKEN_A } from '../fixtures/authentication';
import { member, membershipPage, metadata, videosPage } from '../fixtures/provider';
import { attempt, OBSERVED, owner, success, video } from '../fixtures/storage';

test('Options Connect uses native worker fetch with its required receiver', async () => {
  const extensionPath = resolve('.output/native-fetch-test-composition');
  await cp(resolve('.output/provider-validation/chrome-mv3'), extensionPath, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(extensionPath, 'manifest.json'), 'utf8'));
  manifest.name = 'Likedex — native fetch TEST COMPOSITION';
  // Only this disposable test package accepts data URLs. Native fetch consumes
  // a synthetic response without contacting Google or using a real account.
  manifest.content_security_policy.extension_pages = manifest.content_security_policy.extension_pages
    .replace('connect-src https://www.googleapis.com https://oauth2.googleapis.com',
      'connect-src https://www.googleapis.com https://oauth2.googleapis.com data:');
  await writeFile(resolve(extensionPath, 'manifest.json'), JSON.stringify(manifest));
  const prelude = `(() => {
    const nativeFetch = globalThis.fetch;
    const body = ${JSON.stringify(channelResponse())};
    chrome.identity.getAuthToken = async () => ({ token: ${JSON.stringify(TOKEN_A)}, grantedScopes: ['https://www.googleapis.com/auth/youtube.readonly'] });
    globalThis.nativeFetchChecks = [];
    globalThis.nativeFetchFailure = true;
    globalThis.fetch = function(input, init) {
      if (globalThis.nativeFetchFailure) throw new TypeError('Illegal invocation synthetic-private-diagnostic-sentinel');
      const url = new URL(String(input));
      globalThis.nativeFetchChecks.push({ correctUrl: url.href === 'https://www.googleapis.com/youtube/v3/channels?mine=true&part=id%2Csnippet%2CcontentDetails',
        bearerCorrect: init.headers.Authorization === 'Bearer ' + ${JSON.stringify(TOKEN_A)}, method: init.method, activeSignal: !init.signal.aborted });
      // Preserve the actual receiver: an arrow mock would conceal the bug.
      return nativeFetch.call(this, 'data:application/json,' + encodeURIComponent(JSON.stringify(body)), init);
    };
  })();\n`;
  await writeFile(resolve(extensionPath, 'background.js'), prelude + await readFile(resolve(extensionPath, 'background.js'), 'utf8'));
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).hostname;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/options.html`);
    await page.getByRole('checkbox').check();
    await page.clock.install();
    await page.getByRole('button', { name: 'Connect YouTube', exact: true }).click();
    const diagnostic = page.getByRole('region', { name: 'Sanitized Connect diagnostic' });
    await expect(diagnostic).toBeVisible();
    expect(JSON.parse((await diagnostic.locator('pre').textContent())!)).toEqual({ phase: 'bootstrap-fetch',
      endpoint: 'youtube.channels.list', httpStatus: null, errorCode: 'fetch-invocation', retryOccurred: false });
    expect(await diagnostic.textContent()).not.toContain('synthetic-private-diagnostic-sentinel');
    expect(await diagnostic.textContent()).not.toContain(TOKEN_A);
    await page.clock.fastForward(600_001);
    await expect(diagnostic).toHaveCount(0);
    await worker.evaluate(() => { (globalThis as unknown as { nativeFetchFailure: boolean }).nativeFetchFailure = false; });
    await page.getByRole('button', { name: 'Connect YouTube', exact: true }).click();
    await expect(page.getByText('YouTube connected · read-only')).toBeVisible();
    const checks = await worker.evaluate(() => (globalThis as unknown as { nativeFetchChecks: unknown[] }).nativeFetchChecks);
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((check) => JSON.stringify(check) === JSON.stringify({ correctUrl: true, bearerCorrect: true, method: 'GET', activeSignal: true }))).toBe(true);
  } finally { await context.close(); }
});

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
    globalThis.validationPrematureTerminal = false;
    globalThis.validationInvalidItem = false;
    chrome.identity.getAuthToken = async () => ({ token: fixtures.token, grantedScopes: ['https://www.googleapis.com/auth/youtube.readonly'] });
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const body = url.pathname.endsWith('/channels') ? fixtures.channel
        : url.pathname.endsWith('/playlistItems') ? url.searchParams.has('pageToken')
          ? globalThis.validationInvalidItem ? { ...fixtures.second, items: fixtures.second.items.map((item) => ({ ...item,
              contentDetails: undefined, snippet: { ...item.snippet, publishedAt: 'private-date-sentinel' } })) }
            : globalThis.validationPrematureTerminal ? { ...fixtures.second, items: [], pageInfo: { totalResults: 2, resultsPerPage: 0 } } : fixtures.second
          : fixtures.first
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
    expect(evidence.enumerationDiagnostic).toMatchObject({ reasonCode: 'trusted-complete', internalStop: 'none',
      observedMembershipCount: 2, expectedTotal: 2, reportedTotal: 2, lastResponseHadNextPageToken: false,
      pageChain: [{ pageOrdinal: 1, tokenRelation: 'first', hydrationRequestedCount: 1, hydrationReturnedCount: 1 },
        { pageOrdinal: 2, tokenRelation: 'none', hydrationRequestedCount: 1, hydrationReturnedCount: 1 }] });
    expect(JSON.stringify(evidence)).not.toContain(TOKEN_A);
    expect(await raw()).toEqual(before);
    const gate = await page.evaluate(() => (globalThis as unknown as { chrome: typeof browser }).chrome.runtime.sendMessage({
      protocolVersion: 1, requestId: crypto.randomUUID(), operation: 'SYNC_START', payload: {},
    }));
    expect(gate).toMatchObject({ ok: false, error: { code: 'provider-validation-required' } });
    expect(await raw()).toEqual(before);
    await worker.evaluate(() => { (globalThis as unknown as { validationPrematureTerminal: boolean }).validationPrematureTerminal = true; });
    await page.getByRole('button', { name: 'Observe provider without syncing' }).click();
    await expect(page.getByText('Observation failed: untrusted-enumeration', { exact: false })).toBeVisible();
    const failedEvidence = JSON.parse((await page.locator('pre').textContent())!);
    expect(failedEvidence).toMatchObject({ status: 'failed', summary: { pages: 1, rawMemberships: 1, trustedCompletion: false },
      enumerationDiagnostic: { reasonCode: 'pagination-premature-terminal', observedMembershipCount: 1, expectedTotal: 2,
        reportedTotal: 2, lastResponseHadNextPageToken: false, internalStop: 'none',
        pageChain: [{ pageOrdinal: 1, itemCount: 1 }, { pageOrdinal: 2, itemCount: 0, hydrationRequestedCount: null }] } });
    for (const secret of [TOKEN_A, 'synthetic-next', 'source-1', 'owner-a', 'Video 1']) expect(JSON.stringify(failedEvidence)).not.toContain(secret);
    expect(await raw()).toEqual(before);
    await worker.evaluate(() => {
      const state = globalThis as unknown as { validationPrematureTerminal: boolean; validationInvalidItem: boolean };
      state.validationPrematureTerminal = false; state.validationInvalidItem = true;
    });
    await page.getByRole('button', { name: 'Observe provider without syncing' }).click();
    await expect.poll(async () => JSON.parse((await page.locator('pre').textContent()) ?? '{}').enumerationDiagnostic?.reasonCode)
      .toBe('membership-content-details-missing');
    const itemEvidence = JSON.parse((await page.locator('pre').textContent())!);
    expect(itemEvidence).toMatchObject({ status: 'failed', summary: { pages: 1, rawMemberships: 1, trustedCompletion: false },
      enumerationDiagnostic: { internalStop: 'none', invalidItems: [{ pageOrdinal: 2, itemOrdinal: 1,
        reasonCodes: ['membership-content-details-missing'], fieldPresence: { contentDetails: false, contentVideoId: false,
          snippetVideoId: true, publishedAt: true }, resourceKindIsVideo: true, videoIdsAgree: null,
        playlistIdMatchesExpected: true, likedAtParses: false }] } });
    for (const secret of [TOKEN_A, 'synthetic-next', 'source-2', 'owner-a', 'Video 2', 'private-date-sentinel']) expect(JSON.stringify(itemEvidence)).not.toContain(secret);
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
