import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChromeIdentityAdapter } from '@/src/auth/chrome-identity';
import { AuthenticationError } from '@/src/auth/errors';
import { GoogleAuthorizationRequests, type FetchBoundary } from '@/src/auth/google-requests';
import { AuthenticationService } from '@/src/auth/service';
import { LikedexDatabase } from '@/src/storage/database';
import { LibraryRepository, StorageError } from '@/src/storage/repository';
import { SynchronizationService } from '@/src/sync/service';
import { RuntimeClient } from '@/src/runtime/client';
import { RuntimeCoordinator, type LifecycleScheduler } from '@/src/runtime/coordinator';
import { PRODUCTION_PROVIDER_VALIDATION_APPROVED } from '@/src/runtime/production-gate';
import { type RuntimeOperation, type RuntimeRequest, type RevisionEvent, resultSchemas } from '@/src/runtime/contracts';
import { attempt, NOW, OBSERVED, owner, success, video } from '../fixtures/storage';
import { channelResponse, chromeIdentity, held, json, timing } from '../fixtures/authentication';
import { member, membershipPage, metadata, videosPage } from '../fixtures/provider';

const EXTENSION = 'mmefiakgfhddiojfdnkfpfpbkgbfgkgj';
const SENDER = { id: EXTENSION, url: `chrome-extension://${EXTENSION}/options.html` };
const WORKER = '00000000-0000-4000-8000-000000000090';
const NEXT_WORKER = '00000000-0000-4000-8000-000000000091';
const REQUEST = '00000000-0000-4000-8000-000000000092';
const databases: LikedexDatabase[] = [];
const coordinators: RuntimeCoordinator[] = [];
afterEach(async () => {
  coordinators.splice(0).forEach((coordinator) => coordinator.dispose());
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});
function manualScheduler() {
  const jobs: { callback: () => void; delay: number; cancelled: boolean }[] = [];
  const scheduler: LifecycleScheduler = { schedule: (callback, delay) => {
    const job = { callback, delay, cancelled: false }; jobs.push(job);
    return () => { job.cancelled = true; };
  } };
  return { scheduler, jobs, fire: () => { const job = jobs.findLast((item) => !item.cancelled);
    expect(job).toBeDefined(); job!.cancelled = true; job!.callback(); } };
}
function request(operation: RuntimeOperation): RuntimeRequest { return { protocolVersion: 1, requestId: REQUEST, operation, payload: {} }; }
async function setup(options: { seed?: boolean; connected?: boolean; gate?: unknown; worker?: string; diagnostics?: boolean; advancingClock?: boolean } = {}) {
  let now = NOW;
  const clock = () => {
    if (options.advancingClock) now = new Date(Date.parse(now) + 1).toISOString();
    return now;
  };
  const listeners = new Set<(event: RevisionEvent) => void>();
  const events: RevisionEvent[] = [];
  const db = new LikedexDatabase('likedex', { indexedDB: new IDBFactory(), IDBKeyRange }); databases.push(db);
  const repository = new LibraryRepository(db, (control) => {
    const event: RevisionEvent = { protocolVersion: 1, event: 'STATE_REVISION', revision: control.revision,
      dataGeneration: control.dataGeneration, authEpoch: control.authEpoch };
    events.push(event); listeners.forEach((listener) => listener(event));
  });
  await repository.initialize();
  let snapshot = await repository.readSnapshot(now);
  if (options.connected ?? true) snapshot = await repository.saveConnectionState({ connectionGate: 'connected',
    authorizationCheckDueAt: '2026-10-05T12:00:00.000Z' }, snapshot.fence, now);
  if (options.seed) {
    snapshot = await repository.saveOwner(owner(), snapshot.fence, now);
    snapshot = await repository.saveCurrentAttempt(attempt({ authEpoch: snapshot.control.authEpoch }), snapshot.fence, now);
    snapshot = await repository.upsertVideos([video()], snapshot.fence, now);
    snapshot = await repository.saveCurrentAttempt(attempt({ authEpoch: snapshot.control.authEpoch,
      state: 'success', finishedAt: OBSERVED }), snapshot.fence, now);
    snapshot = await repository.saveLatestSuccessfulSync(success(), snapshot.fence, now);
  }
  const chrome = chromeIdentity();
  const fetcher = vi.fn<FetchBoundary>().mockImplementation(async () => json());
  const requests = new GoogleAuthorizationRequests(new ChromeIdentityAdapter(chrome), fetcher,
    { ...timing(), now: () => Date.parse(clock()) });
  const auth = new AuthenticationService(repository, requests, clock);
  const timers = manualScheduler();
  let sequence = 100;
  const sync = new SynchronizationService(repository, requests, options.worker ?? WORKER, clock,
    () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`, (receipt) => {
      auth.acceptSyncAuthorization(receipt); coordinator.authorizationValidated(receipt.scope);
    });
  const coordinator = new RuntimeCoordinator(repository, auth, sync, EXTENSION,
    { providerValidationApproved: options.gate, now: clock, scheduler: timers.scheduler, diagnosticsEnabled: options.diagnostics ?? false });
  coordinators.push(coordinator);
  const client = () => new RuntimeClient({ send: (message) => coordinator.handle(message, SENDER),
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; } });
  return { db, repository, snapshot, chrome, fetcher, requests, auth, sync, coordinator, client, timers, events,
    clock, setNow: (value: string) => { now = value; } };
}
async function records(db: LikedexDatabase) { return Promise.all(db.tables.map((table) => table.toArray())); }

describe('Runtime production gate and validation (AC-SYNC-013; AC-SYNC-011)', () => {
  it.each([false, true])('safe Connect diagnostics are included only by explicit validation composition: %s', async (diagnostics) => {
    const h = await setup({ connected: false, diagnostics });
    h.fetcher.mockRejectedValue(new TypeError('Illegal invocation SECRET'));
    const result = await h.client().request('AUTH_CONNECT');
    expect(result).toMatchObject({ ok: false, error: { code: 'auth-error', detail: { category: 'internal' } } });
    if (result.ok) throw new Error('Expected failure');
    if (diagnostics) expect(result.error.diagnostic).toEqual({ phase: 'bootstrap-fetch', endpoint: 'youtube.channels.list',
      httpStatus: null, errorCode: 'fetch-invocation', retryOccurred: false });
    else expect(result.error.diagnostic).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('committed production approval admits normal preconditions and still rejects disconnected starts', async () => {
    expect(PRODUCTION_PROVIDER_VALIDATION_APPROVED).toBe(true);
    const h = await setup({ connected: false, gate: PRODUCTION_PROVIDER_VALIDATION_APPROVED });
    expect(await h.client().request('SYNC_START')).toMatchObject({ ok: false,
      error: { code: 'auth-error', detail: { category: 'authentication' } } });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(await h.db.sync.count()).toBe(0);
  });
  it.each([false, undefined, null, 'true', 1, {}, 'false'])(
    'closed/missing/malformed gate %j rejects with all records unchanged', async (gate) => {
      const h = await setup({ seed: true, gate });
      const before = await records(h.db);
      h.setNow('2026-10-04T13:00:00.000Z');
      const start = vi.spyOn(h.sync, 'start');
      const initialize = vi.spyOn(h.coordinator, 'initialize');
      const read = vi.spyOn(h.repository, 'readSnapshot');
      const finalize = vi.spyOn(h.repository, 'finalizeTrustedEnumeration');
      expect(await h.client().request('SYNC_START')).toMatchObject({ ok: false, error: { code: 'provider-validation-required' } });
      expect(await records(h.db)).toEqual(before);
      for (const spy of [start, initialize, read, finalize, h.chrome.getAuthToken, h.fetcher]) expect(spy).not.toHaveBeenCalled();
    });
  it('rejected Sync cannot trigger even overdue retention; independent startup still deletes expiry', async () => {
    const h = await setup({ seed: true });
    const before = await records(h.db);
    h.setNow('2026-10-15T00:00:00.000Z');
    expect(await h.client().request('SYNC_START')).toMatchObject({ ok: false, error: { code: 'provider-validation-required' } });
    expect(await records(h.db)).toEqual(before);
    await h.coordinator.initialize();
    expect(await h.db.videos.count()).toBe(0);
    expect((await h.repository.readControl()).lastCleanupReason).toBe('expiry');
  });
  it.each([null, undefined, {}, { ...request('SYNC_START'), operation: 'PRUNE' },
    { ...request('SYNC_START'), protocolVersion: 2 }, { ...request('SYNC_START'), requestId: 'invalid' },
    { ...request('SYNC_START'), payload: { providerValidationApproved: true } },
    { ...request('AUTH_CONNECT'), token: 'raw-sensitive-value' }])('rejects invalid envelope %j without any work', async (raw) => {
    const h = await setup({ seed: true, gate: true });
    const before = await records(h.db);
    const initialize = vi.spyOn(h.coordinator, 'initialize');
    expect(await h.coordinator.handle(raw, SENDER)).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(initialize).not.toHaveBeenCalled();
    expect(h.chrome.getAuthToken).not.toHaveBeenCalled();
    expect(await records(h.db)).toEqual(before);
  });
  it.each([{ id: 'another-extension', url: SENDER.url }, { id: EXTENSION, url: 'https://example.com/' }, {}])(
    'rejects an untrusted sender %j', async (sender) => {
      const h = await setup({ gate: true });
      const init = vi.spyOn(h.coordinator, 'initialize');
      expect(await h.coordinator.handle(request('AUTH_CONNECT'), sender)).toMatchObject({ ok: false, error: { code: 'forbidden' } });
      expect(init).not.toHaveBeenCalled();
    });
});

describe('Runtime local data/auth and failure truth (AC-AUTH-001/002/003/007/009; AC-STORAGE-003/004)', () => {
  it('reads a local unknown-metadata snapshot after a silent session check, without Likes calls', async () => {
    const h = await setup({ seed: true });
    const client = h.client();
    const result = await client.request('LIBRARY_SNAPSHOT_GET');
    expect(result).toMatchObject({ ok: true, result: { owner: owner(), videos: [video()], sync: { latestSuccessfulSync: success() },
      validUntil: '2026-10-05T12:00:00.000Z' } });
    expect(await client.request('AUTH_STATUS_GET')).toMatchObject({ ok: true, result: { status: 'authorized' } });
    expect(await client.request('LIBRARY_SNAPSHOT_GET')).toMatchObject({ ok: true });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    expect(new URL(h.fetcher.mock.calls[0]![0]).pathname).toBe('/youtube/v3/channels');
    expect(h.chrome.getAuthToken.mock.calls.every(([input]) => !input.interactive)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('synthetic-token');
  });
  it('fresh startup/passive checks never consent; only explicit Connect acquires interactively', async () => {
    const h = await setup({ connected: false, gate: PRODUCTION_PROVIDER_VALIDATION_APPROVED });
    const start = vi.spyOn(h.sync, 'start');
    await h.coordinator.initialize();
    expect(await h.client().request('AUTH_STATUS_GET')).toMatchObject({ ok: true, result: { status: 'auth-required' } });
    expect(await h.client().request('LIBRARY_SNAPSHOT_GET')).toMatchObject({ ok: true, result: { videos: [], owner: null } });
    expect(h.chrome.getAuthToken).not.toHaveBeenCalled();
    expect(await h.client().request('AUTH_CONNECT')).toMatchObject({ ok: true, result: { status: 'authorized' } });
    expect(h.chrome.getAuthToken.mock.calls[0]![0].interactive).toBe(true);
    expect(await h.db.owner.count()).toBe(0);
    expect(await h.db.videos.count()).toBe(0);
    expect(await h.db.sync.count()).toBe(0);
    expect(start).not.toHaveBeenCalled();
    expect(h.fetcher.mock.calls.every(([url]) => new URL(url).pathname.endsWith('/channels'))).toBe(true);
  });
  it('enabled-gate disconnected start is auth-required without provider ingestion', async () => {
    const h = await setup({ connected: false, gate: true });
    expect(await h.client().request('SYNC_START')).toMatchObject({ ok: false, error: { code: 'auth-error', detail: { category: 'authentication' } } });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(await h.db.sync.count()).toBe(0);
  });
  it('Connect denial preserves eligible data and latest success', async () => {
    const h = await setup({ seed: true });
    h.chrome.getAuthToken.mockRejectedValue(new Error('access_denied'));
    expect(await h.client().request('AUTH_CONNECT')).toMatchObject({ ok: false, error: { code: 'auth-error', detail: { category: 'permission' } } });
    expect(await h.db.videos.toArray()).toEqual([video()]);
    expect((await h.db.sync.toArray())[0]?.latestSuccessfulSync).toEqual(success());
  });
  it('Connect mismatch returns both identities without replacing owner/membership/success', async () => {
    const h = await setup({ seed: true });
    const body = channelResponse(); body.items[0]!.id = 'other-owner';
    body.items[0]!.contentDetails.relatedPlaylists.likes = 'likes-other-owner';
    h.fetcher.mockResolvedValue(json(body));
    const before = await records(h.db);
    expect(await h.client().request('AUTH_CONNECT')).toMatchObject({ ok: true, result: { status: 'owner-mismatch',
      bootstrap: { channelId: 'other-owner' }, localOwnerChannelId: 'owner-a' } });
    expect(await records(h.db)).toEqual(before);
  });
  it('enabled Sync is busy during held Connect; Disconnect fences its late completion', async () => {
    const h = await setup({ seed: true, gate: true });
    const bootstrap = held<Response>();
    h.fetcher.mockReturnValueOnce(bootstrap.promise).mockResolvedValue(new Response(null));
    const connecting = h.client().request('AUTH_CONNECT');
    await vi.waitFor(() => expect(h.fetcher).toHaveBeenCalledTimes(1));
    const start = vi.spyOn(h.sync, 'start');
    expect(await h.client().request('SYNC_START')).toMatchObject({ ok: false, error: { code: 'auth-error' } });
    expect(start).not.toHaveBeenCalled();
    expect(await h.client().request('AUTH_DISCONNECT')).toMatchObject({ ok: true, result: { completed: true } });
    bootstrap.resolve(json());
    expect(await connecting).toMatchObject({ ok: false, error: { code: 'auth-error', detail: { category: 'interrupted' } } });
    expect(await h.db.videos.count()).toBe(0); expect(await h.db.sync.count()).toBe(0);
    expect((await h.repository.readControl()).connectionGate).toBe('disconnected');
  });
  it('storage snapshot failure is explicit and cannot become an empty library', async () => {
    const h = await setup();
    await h.coordinator.initialize();
    vi.spyOn(h.repository, 'readSnapshot').mockRejectedValue(new StorageError('persistence'));
    expect(await h.client().request('LIBRARY_SNAPSHOT_GET')).toMatchObject({ ok: false, error: { code: 'auth-error', detail: { category: 'persistence' } } });
  });
  it('a failed local read after valid authorization remains storage-error', async () => {
    const h = await setup({ seed: true });
    await h.client().request('AUTH_STATUS_GET');
    vi.spyOn(h.repository, 'readSnapshot').mockRejectedValue(new StorageError('persistence'));
    expect(await h.client().request('LIBRARY_SNAPSHOT_GET')).toMatchObject({ ok: false, error: { code: 'auth-error', detail: { category: 'persistence' } } });
  });
  it('unexpected handler failure is sanitized, without exception strings/stacks', async () => {
    const h = await setup();
    vi.spyOn(h.auth, 'inspectAuthenticationState').mockRejectedValue(new Error('SECRET raw provider body / credentials'));
    const result = await h.client().request('AUTH_STATUS_GET');
    expect(result).toEqual({ ok: false, error: { code: 'internal-error', detail: null, cleanup: null } });
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('required network verification failure deletes for unverified authorization, never alleged revocation', async () => {
    const h = await setup({ seed: true });
    h.fetcher.mockRejectedValue(new TypeError('offline'));
    expect(await h.client().request('AUTH_STATUS_GET')).toMatchObject({ ok: false,
      error: { code: 'auth-error', detail: { category: 'authorization-unverified', messageKey: 'access-unverified' },
        cleanup: { deletion: 'succeeded', cacheInvalidation: 'succeeded', persistence: 'succeeded' } } });
    expect(await h.db.videos.count()).toBe(0);
    expect((await h.repository.readControl()).lastCleanupReason).toBe('authorization-unverified');
  });
  it('confirmed invalid grant has its separate cleanup reason', async () => {
    const h = await setup({ seed: true });
    h.chrome.getAuthToken.mockRejectedValue(new Error('invalid_grant'));
    expect(await h.client().request('AUTH_STATUS_GET')).toMatchObject({ ok: false, error: { detail: { category: 'authentication' } } });
    expect((await h.repository.readControl()).lastCleanupReason).toBe('authorization-invalid');
  });
  it('reports independent partial Disconnect results and deletes despite revoke failure', async () => {
    const h = await setup({ seed: true });
    h.fetcher.mockResolvedValue(new Response(null, { status: 500 }));
    const result = await h.client().request('AUTH_DISCONNECT');
    expect(result).toMatchObject({ ok: true, result: { completed: false, revocation: 'failed', deletion: 'succeeded',
      cacheInvalidation: 'succeeded', fencing: 'succeeded', statusPersistence: 'succeeded' } });
    expect(await h.db.videos.count()).toBe(0);
    expect(await h.db.owner.count()).toBe(0);
    expect(await h.db.sync.count()).toBe(0);
    expect(await h.client().request('AUTH_STATUS_GET')).toMatchObject({ ok: true, result: { status: 'auth-required',
      control: { revocationStatus: 'failed', deletionStatus: 'succeeded', cacheInvalidationStatus: 'succeeded' } } });
  });
  it('Disconnect still attempts revoke/cache when startup and local deletion fail', async () => {
    const h = await setup({ seed: true });
    h.fetcher.mockResolvedValue(new Response(null));
    vi.spyOn(h.sync, 'recoverInterruption').mockRejectedValue(new StorageError('persistence'));
    vi.spyOn(h.repository, 'finishCleanup').mockRejectedValue(new StorageError('persistence'));
    expect(await h.client().request('AUTH_DISCONNECT')).toMatchObject({ ok: true,
      result: { completed: false, revocation: 'succeeded', cacheInvalidation: 'succeeded', deletion: 'failed' } });
    expect(await h.db.videos.count()).toBe(1);
    expect((await h.repository.readControl()).pendingCleanupReason).toBe('disconnect');
    expect(h.chrome.clearAllCachedAuthTokens).toHaveBeenCalled();
  });
  it('shared passive checks perform one silent request across two clients', async () => {
    const h = await setup({ seed: true });
    const pending = held<Response>(); h.fetcher.mockReturnValue(pending.promise);
    const first = h.client().request('LIBRARY_SNAPSHOT_GET');
    await vi.waitFor(() => expect(h.fetcher).toHaveBeenCalledTimes(1));
    const second = h.client().request('LIBRARY_SNAPSHOT_GET');
    expect(await h.client().request('SYNC_STATUS_GET')).toMatchObject({ ok: true, result: { status: 'validation-pending' } });
    pending.resolve(json());
    const results = await Promise.all([first, second]);
    expect(results[0]).toEqual(results[1]);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('Runtime active sync/recovery (AC-SYNC-003/004/007/008/012)', () => {
  it('overlaps snapshot/auth requests with six real page commits under an advancing clock', async () => {
    const h = await setup({ seed: true, gate: true, advancingClock: true });
    const pages = Array.from({ length: 6 }, () => held<Response>());
    let requestedPages = 0;
    h.fetcher.mockImplementation(async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/channels')) return json(channelResponse());
      if (parsed.pathname.endsWith('/playlistItems')) return pages[requestedPages++]!.promise;
      const ids = parsed.searchParams.get('id')!.split(',');
      return json(videosPage(ids.map((id) => metadata(Number(id.slice(1))))));
    });
    const codes: string[] = [];
    const read = h.repository.readSnapshot.bind(h.repository);
    vi.spyOn(h.repository, 'readSnapshot').mockImplementation(async (...args) => {
      try { return await read(...args); }
      catch (error) { if (error instanceof StorageError) codes.push(error.code); throw error; }
    });
    const start = vi.spyOn(h.sync, 'start');
    expect(await h.client().request('SYNC_START')).toMatchObject({ ok: true });
    const launch = await start.mock.results[0]!.value;
    for (let index = 0; index < pages.length; index++) {
      await vi.waitFor(() => expect(requestedPages).toBe(index + 1));
      const reads = Array.from({ length: 12 }, (_, i) => h.client().request(i % 2 ? 'AUTH_STATUS_GET' : 'LIBRARY_SNAPSHOT_GET'));
      pages[index]!.resolve(json(membershipPage([member(index + 1)], index < 5 ? `next-${index + 1}` : undefined, 6)));
      const results = await Promise.all(reads);
      expect(codes).toEqual([]);
      expect(results.every((result) => result.ok)).toBe(true);
      await vi.waitFor(async () => expect((await h.repository.readSnapshot(h.clock)).sync?.currentAttempt?.pagesAccepted).toBe(index + 1));
    }
    expect(await launch.completion).toMatchObject({ status: 'success' });
    expect(codes).toEqual([]);
    expect((await h.repository.readSnapshot(h.clock)).sync?.latestSuccessfulSync).toMatchObject({ pageCount: 6, localMembershipCount: 6 });
    h.setNow(NOW);
    await expect(h.repository.readSnapshot(h.clock)).rejects.toMatchObject({ code: 'clock-unverified' });
  });
  it('acknowledges before held bootstrap within 1 second; duplicate clients share durable truth', async () => {
    const h = await setup({ gate: PRODUCTION_PROVIDER_VALIDATION_APPROVED, seed: true });
    const bootstrap = held<Response>(); const page = held<Response>();
    h.fetcher.mockReturnValueOnce(bootstrap.promise).mockReturnValueOnce(page.promise)
      .mockResolvedValueOnce(json(videosPage())).mockResolvedValueOnce(json(channelResponse()));
    const options = h.client(); const panel = h.client();
    const startedAt = performance.now();
    const [first, duplicate] = await Promise.all([options.request('SYNC_START'), panel.request('SYNC_START')]);
    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(first).toMatchObject({ ok: true, result: { status: 'started', attempt: { state: 'preparing' } } });
    expect(duplicate).toMatchObject({ ok: true, result: { status: 'already-active' } });
    if (!first.ok || !duplicate.ok) throw new Error('start failed');
    expect(first.result.attempt.attemptId).toBe(duplicate.result.attempt.attemptId);
    const pendingStatus = await panel.request('SYNC_STATUS_GET');
    expect(pendingStatus).toMatchObject({ ok: true, result: { status: 'validation-pending', attempt: first.result.attempt } });
    expect(JSON.stringify(pendingStatus)).not.toMatch(/owner-a|rawItems|latestSuccessfulSync|localMembershipCount/);
    expect(await options.request('LIBRARY_SNAPSHOT_GET')).toMatchObject({ ok: false, error: { code: 'authorization-pending' } });
    bootstrap.resolve(json());
    await vi.waitFor(() => expect(h.fetcher).toHaveBeenCalledTimes(2));
    const observed = await panel.request('SYNC_STATUS_GET');
    expect(observed).toMatchObject({ ok: true, result: { status: 'observed', sync: { currentAttempt: { state: 'scanning' } } } });
    expect(h.fetcher).toHaveBeenCalledTimes(2); // genuine sync check reused, no racing bootstrap
    page.resolve(json(membershipPage()));
    await vi.waitFor(async () => expect((await h.repository.readSnapshot(NOW)).sync?.currentAttempt?.state).toBe('success'));
    const [a, b] = await Promise.all([options.request('SYNC_STATUS_GET'), panel.request('SYNC_STATUS_GET')]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: true, result: { sync: { currentAttempt: { state: 'success' }, latestSuccessfulSync: { localMembershipCount: 1 } } } });
    expect(h.fetcher.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/playlistItems'))).toHaveLength(1);
  });
  it('later ordinary network failure and previous success stay simultaneously visible', async () => {
    const h = await setup({ seed: true, gate: PRODUCTION_PROVIDER_VALIDATION_APPROVED });
    h.fetcher.mockResolvedValueOnce(json()).mockRejectedValue(new TypeError('network'));
    expect(await h.client().request('SYNC_START')).toMatchObject({ ok: true });
    await vi.waitFor(async () => expect((await h.repository.readSnapshot(NOW)).sync?.currentAttempt?.state).toBe('failure'));
    expect(await h.client().request('SYNC_STATUS_GET')).toMatchObject({ ok: true, result: {
      sync: { currentAttempt: { state: 'failure', error: { category: 'network' } }, latestSuccessfulSync: success() } } });
    expect(await h.db.videos.toArray()).toEqual([video()]);
  });
  it('initialization recovers abandoned safe progress, preserves success and is idempotent', async () => {
    const h = await setup({ seed: true, worker: NEXT_WORKER, gate: true });
    await h.db.sync.update('singleton', { currentAttempt: attempt({ workerInstanceId: WORKER,
      authEpoch: h.snapshot.control.authEpoch, pagesAccepted: 1, rawItems: 1, uniqueMembership: 1, safeCommits: 1 }) });
    await h.coordinator.initialize();
    const once = await records(h.db);
    await h.coordinator.initialize();
    expect(await records(h.db)).toEqual(once);
    expect(await h.client().request('SYNC_STATUS_GET')).toMatchObject({ ok: true, result: { sync: {
      currentAttempt: { state: 'interrupted', pagesAccepted: 1, safeCommits: 1 }, latestSuccessfulSync: success() } } });
    expect(h.fetcher.mock.calls.every(([url]) => new URL(url).pathname.endsWith('/channels'))).toBe(true);
    expect(await h.db.videos.toArray()).toEqual([video()]);
  });
  it('recovery failure never returns idle or never-synced status', async () => {
    const h = await setup({ seed: true });
    vi.spyOn(h.sync, 'recoverInterruption').mockRejectedValue(new StorageError('persistence'));
    expect(await h.client().request('SYNC_STATUS_GET')).toMatchObject({ ok: false, error: { code: 'storage-error' } });
    expect((await h.db.sync.get('singleton'))?.latestSuccessfulSync).toEqual(success());
  });
  it('status-unsaved remains a runtime storage failure until restart or acknowledged cleanup', async () => {
    const h = await setup({ seed: true, gate: true });
    h.fetcher.mockResolvedValueOnce(json()).mockResolvedValue(json({ invalid: true }));
    vi.spyOn(h.repository, 'finishSyncAttempt').mockRejectedValue(new StorageError('persistence'));
    const start = vi.spyOn(h.sync, 'start');
    await h.client().request('SYNC_START');
    const launch = await start.mock.results[0]!.value;
    expect((await launch.completion)?.status).toBe('status-unsaved');
    await vi.waitFor(async () => expect(await h.client().request('SYNC_STATUS_GET')).toMatchObject({ ok: false, error: { code: 'storage-error' } }));
    expect((await h.db.sync.get('singleton'))?.latestSuccessfulSync).toEqual(success());
  });
  it('failed recovery can be retried at the next activation without inventing state', async () => {
    const h = await setup({ seed: true });
    const recover = h.sync.recoverInterruption.bind(h.sync);
    vi.spyOn(h.sync, 'recoverInterruption').mockRejectedValueOnce(new StorageError('persistence')).mockImplementation(recover);
    expect(await h.client().request('SYNC_STATUS_GET')).toMatchObject({ ok: false });
    expect(await h.client().request('SYNC_STATUS_GET')).toMatchObject({ ok: true, result: { sync: { latestSuccessfulSync: success() } } });
  });
  it('Disconnect remains serviceable during held bootstrap and fences late completion', async () => {
    const h = await setup({ seed: true, gate: true });
    const bootstrap = held<Response>(); h.fetcher.mockReturnValueOnce(bootstrap.promise).mockResolvedValue(new Response(null));
    await h.client().request('SYNC_START');
    await vi.waitFor(() => expect(h.fetcher).toHaveBeenCalled());
    expect(await h.client().request('AUTH_DISCONNECT')).toMatchObject({ ok: true, result: { completed: true } });
    bootstrap.resolve(json());
    await vi.waitFor(async () => expect(await h.db.sync.count()).toBe(0));
    expect(await h.db.owner.count()).toBe(0); expect(await h.db.videos.count()).toBe(0);
    expect((await h.repository.readControl()).connectionGate).toBe('disconnected');
  });
});

describe('Lifecycle timers and wake barriers (AC-DATA-013–016)', () => {
  it('first use after inactivity deletes expired owner/videos/sync before returning a snapshot', async () => {
    const h = await setup({ seed: true });
    await h.coordinator.initialize();
    h.setNow('2026-10-15T00:00:00.000Z');
    expect(await h.client().request('LIBRARY_SNAPSHOT_GET')).toMatchObject({ ok: true, result: {
      owner: null, videos: [], sync: null, lastCleanupReason: 'expiry' } });
    expect(await h.db.sync.count()).toBe(0);
  });
  it('an active deadline timer enforces expiry independently of Sync gate', async () => {
    const h = await setup({ seed: true });
    await h.client().request('LIBRARY_SNAPSHOT_GET');
    h.setNow('2026-10-15T00:00:00.000Z'); h.timers.fire();
    await vi.waitFor(async () => expect(await h.db.videos.count()).toBe(0));
    expect((await h.repository.readControl()).lastCleanupReason).toBe('expiry');
  });
  it('due authorization timer silently checks at 24 hours without renewing API freshness', async () => {
    const h = await setup({ seed: true });
    await h.client().request('LIBRARY_SNAPSHOT_GET');
    const before = await h.db.videos.toArray();
    h.setNow('2026-10-05T12:00:00.000Z'); h.timers.fire();
    await vi.waitFor(() => expect(h.fetcher).toHaveBeenCalledTimes(2));
    await vi.waitFor(async () => expect((await h.repository.readControl()).authorizationCheckDueAt).toBe('2026-10-06T12:00:00.000Z'));
    expect(await h.db.videos.toArray()).toEqual(before);
    expect(h.chrome.getAuthToken.mock.calls.every(([input]) => !input.interactive)).toBe(true);
  });
  it('failed pending deletion blocks data; next worker retries before passive inspection', async () => {
    const h = await setup({ seed: true });
    const control = await h.repository.readControl();
    await h.repository.beginCleanup('authorization-invalid', control);
    const finish = vi.spyOn(h.repository, 'finishCleanup').mockRejectedValueOnce(new StorageError('persistence'));
    expect(await h.client().request('LIBRARY_SNAPSHOT_GET')).toMatchObject({ ok: false });
    expect(await h.db.videos.count()).toBe(1);
    finish.mockRestore();
    const auth = new AuthenticationService(h.repository, h.requests, () => NOW);
    const sync = new SynchronizationService(h.repository, h.requests, NEXT_WORKER, () => NOW);
    const restarted = new RuntimeCoordinator(h.repository, auth, sync, EXTENSION, { now: () => NOW, scheduler: h.timers.scheduler });
    coordinators.push(restarted);
    expect(await restarted.handle(request('LIBRARY_SNAPSHOT_GET'), SENDER)).toMatchObject({ ok: true, result: { videos: [], owner: null, sync: null } });
    expect(h.chrome.getAuthToken).not.toHaveBeenCalled();
  });
  it('backward clocks fail explicitly rather than exposing expired-looking data', async () => {
    const h = await setup({ seed: true });
    await h.coordinator.initialize(); h.setNow('2026-10-03T12:00:00.000Z');
    expect(await h.client().request('LIBRARY_SNAPSHOT_GET')).toMatchObject({ ok: false });
  });
});

describe('Runtime client response/transport contract (AC-SYNC-011)', () => {
  it.each([undefined, null, false, {}, { ok: true, result: [] },
    { protocolVersion: 1, requestId: REQUEST, operation: 'SYNC_STATUS_GET', ok: true, result: { status: 'observed', sync: null } },
    { protocolVersion: 1, requestId: WORKER, operation: 'SYNC_STATUS_GET', ok: true, result: {} },
    { protocolVersion: 1, requestId: REQUEST, operation: 'AUTH_STATUS_GET', ok: true, result: { status: 'auth-required' } }])(
    'malformed/unmatched response %j is protocol failure', async (raw) => {
      const client = new RuntimeClient({ send: async () => raw }, () => REQUEST);
      expect(await client.request('SYNC_STATUS_GET')).toMatchObject({ ok: false, error: { code: 'protocol-error' } });
    });
  it('transport loss remains typed; no automatic mutation replay', async () => {
    const send = vi.fn().mockRejectedValue(new Error('port closed with sensitive raw text'));
    const client = new RuntimeClient({ send });
    expect(await client.request('SYNC_START')).toMatchObject({ ok: false, error: { code: 'transport-error' } });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('rejects falsely completed Disconnect response', () => {
    expect(resultSchemas.AUTH_DISCONNECT.safeParse({ completed: true, revocation: 'failed', cacheInvalidation: 'succeeded',
      fencing: 'succeeded', deletion: 'succeeded', statusPersistence: 'succeeded', error: null }).success).toBe(false);
  });
  it('sanitized ordinary auth failure remains a failure through the client', async () => {
    const h = await setup(); vi.spyOn(h.auth, 'inspectAuthenticationState').mockRejectedValue(new AuthenticationError('oauth-configuration'));
    expect(await h.client().request('AUTH_STATUS_GET')).toMatchObject({ ok: false, error: { detail: { category: 'oauth-configuration' } } });
  });
});
