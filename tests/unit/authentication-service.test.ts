import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeIdentityAdapter } from '@/src/auth/chrome-identity';
import { AuthenticationError } from '@/src/auth/errors';
import { GoogleAuthorizationRequests, REVOCATION_URL, type FetchBoundary } from '@/src/auth/google-requests';
import { AuthenticationService } from '@/src/auth/service';
import { LikedexDatabase } from '@/src/storage/database';
import { LibraryRepository } from '@/src/storage/repository';
import { NOW, attempt, owner, success, video } from '../fixtures/storage';
import { TOKEN_A, bootstrap, channelResponse, chromeIdentity, held, json, timing } from '../fixtures/authentication';

let db: LikedexDatabase;
let repository: LibraryRepository;
let chrome: ReturnType<typeof chromeIdentity>;
let fetcher: ReturnType<typeof vi.fn<FetchBoundary>>;
let requests: GoogleAuthorizationRequests;
let service: AuthenticationService;
let now: string;
beforeEach(async () => {
  db = new LikedexDatabase('likedex', { indexedDB: new IDBFactory(), IDBKeyRange });
  repository = new LibraryRepository(db);
  await repository.initialize();
  chrome = chromeIdentity();
  fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(url === REVOCATION_URL ? new Response(null) : json()));
  requests = new GoogleAuthorizationRequests(new ChromeIdentityAdapter(chrome), fetcher, timing());
  now = NOW;
  service = new AuthenticationService(repository, requests, () => now);
});
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });

async function seed(connected = true) {
  let snapshot = await repository.readSnapshot(now);
  if (connected) snapshot = await repository.saveConnectionState({ connectionGate: 'connected',
    authorizationCheckDueAt: '2026-10-05T12:00:00.000Z' }, snapshot.fence, now);
  snapshot = await repository.saveOwner(owner(), snapshot.fence, now);
  snapshot = await repository.saveCurrentAttempt(attempt({ authEpoch: snapshot.control.authEpoch }), snapshot.fence, now);
  snapshot = await repository.upsertVideos([video()], snapshot.fence, now);
  return repository.saveLatestSuccessfulSync(success(), snapshot.fence, now);
}
async function assertDeleted() {
  expect(await db.owner.count()).toBe(0);
  expect(await db.videos.count()).toBe(0);
  expect(await db.sync.count()).toBe(0);
  expect((await repository.readControl()).connectionGate).toBe('disconnected');
}
async function reachRemote() { await vi.waitFor(() => expect(fetcher).toHaveBeenCalled()); }

describe('Authorization service (AC-AUTH-001–006 and AC-IDENTITY-001/003/005 service subset)', () => {
  it('fresh disconnected inspection never calls Chrome or YouTube; silent validation cannot reconnect', async () => {
    await expect(service.inspectAuthenticationState()).resolves.toEqual({ status: 'auth-required' });
    await expect(service.validateAuthorization()).rejects.toMatchObject({ code: 'auth-required' });
    expect(chrome.getAuthToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('explicit connect validates a candidate and saves only data-free connection state', async () => {
    await expect(service.connectInteractively()).resolves.toEqual({ status: 'authorized', bootstrap, ownerComparison: 'NO_LOCAL_OWNER' });
    const snapshot = await repository.readSnapshot(now);
    expect(snapshot.control).toMatchObject({ connectionGate: 'connected', authEpoch: 1, authorizationCheckDueAt: '2026-10-05T12:00:00.000Z' });
    expect(snapshot.owner).toBeNull();
    expect(snapshot.videos).toEqual([]);
    expect(snapshot.sync).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain(TOKEN_A);
    expect(chrome.getAuthToken.mock.calls[0]?.[0].interactive).toBe(true);
  });
  it('does not durably store candidate identity, title, playlist or token in any control field', async () => {
    await service.connectInteractively();
    const records = await Promise.all(db.tables.map((table) => table.toArray()));
    const serialized = JSON.stringify(records);
    for (const value of [TOKEN_A, bootstrap.channelId, bootstrap.channelTitle, bootstrap.likesPlaylistId]) {
      expect(serialized).not.toContain(value);
    }
  });
  it('denied new Connect preserves the eligible mirror and success, with no fabricated connection', async () => {
    const before = await seed();
    chrome.getAuthToken.mockRejectedValue(new Error('The user did not approve access.'));
    await expect(service.connectInteractively()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await repository.readSnapshot(now)).toEqual(before);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('missing/malformed channel Connect cannot save connection or owner', async () => {
    fetcher.mockResolvedValue(json({ kind: 'youtube#channelListResponse', items: [] }));
    await expect(service.connectInteractively()).rejects.toMatchObject({ code: 'identity-missing' });
    expect((await repository.readControl()).connectionGate).toBe('disconnected');
    expect(await db.owner.count()).toBe(0);
  });
  it('first inspection in each service session validates silently despite a future durable deadline', async () => {
    await seed();
    const before = await repository.readSnapshot(now);
    await expect(service.inspectAuthenticationState()).resolves.toMatchObject({ status: 'authorized', ownerComparison: 'SAME_REMOTE_OWNER' });
    const after = await repository.readSnapshot(now);
    expect(after.owner).toEqual(before.owner);
    expect(after.videos).toEqual(before.videos);
    expect(after.sync).toEqual(before.sync);
    expect(after.earliestExpiresAt).toBe(before.earliestExpiresAt);
    expect(after.control.authEpoch).toBe(before.control.authEpoch);
    await service.inspectAuthenticationState();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await new AuthenticationService(repository, requests, () => now).inspectAuthenticationState();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(chrome.getAuthToken.mock.calls.every(([details]) => details.interactive === false)).toBe(true);
  });
  it('requires periodic check at the exact 24h deadline without renewing retained facts', async () => {
    await seed();
    await service.inspectAuthenticationState();
    now = '2026-10-05T11:59:59.999Z';
    await service.inspectAuthenticationState();
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = '2026-10-05T12:00:00.000Z';
    await service.inspectAuthenticationState();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await repository.readControl()).authorizationCheckDueAt).toBe('2026-10-06T12:00:00.000Z');
  });
  it('a different channel with the same title returns typed mismatch and changes no persisted state', async () => {
    const before = await seed();
    const body = channelResponse(); body.items[0]!.id = 'owner-b';
    fetcher.mockImplementation(() => Promise.resolve(json(body)));
    await expect(service.connectInteractively()).resolves.toMatchObject({ status: 'owner-mismatch',
      localOwnerChannelId: 'owner-a', bootstrap: { channelId: 'owner-b' }, error: { code: 'owner-mismatch' } });
    expect(await repository.readSnapshot(now)).toEqual(before);
    await expect(service.validateAuthorization()).resolves.toMatchObject({ status: 'owner-mismatch' });
    expect(await repository.readSnapshot(now)).toEqual(before);
  });
  it('reaquired token owner mismatch never refreshes the gate or mutates the mirror', async () => {
    const before = await seed();
    const body = channelResponse(); body.items[0]!.id = 'owner-b';
    fetcher.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(body));
    await expect(service.validateAuthorization()).resolves.toMatchObject({ status: 'owner-mismatch' });
    expect(await repository.readSnapshot(now)).toEqual(before);
  });
  it('storage read failures stay storage failures, never empty or auth-required', async () => {
    await seed();
    vi.spyOn(db.videos, 'toArray').mockRejectedValueOnce(new Error(TOKEN_A));
    await expect(service.inspectAuthenticationState()).rejects.toMatchObject({ code: 'storage' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('a held Connect cannot restore the gate after Clear changes generation', async () => {
    const response = held<Response>(); fetcher.mockReturnValue(response.promise);
    const connecting = service.connectInteractively();
    await reachRemote();
    await repository.clearLocalData(await repository.readControl());
    response.resolve(json());
    await expect(connecting).rejects.toMatchObject({ code: 'cancelled' });
    expect((await repository.readControl()).connectionGate).toBe('disconnected');
  });
  it('blocks duplicate Connect/validation while a remote request is held', async () => {
    const response = held<Response>(); fetcher.mockReturnValue(response.promise);
    const connecting = service.connectInteractively();
    await reachRemote();
    await expect(service.connectInteractively()).rejects.toMatchObject({ code: 'busy' });
    await expect(service.validateAuthorization()).rejects.toMatchObject({ code: 'busy' });
    response.resolve(json()); await connecting;
  });
  it('failed Connect invalidates prior session evidence so later inspection revalidates silently', async () => {
    await seed(); await service.inspectAuthenticationState();
    chrome.getAuthToken.mockRejectedValueOnce(new Error('The user did not approve access.'));
    await expect(service.connectInteractively()).rejects.toMatchObject({ code: 'permission-denied' });
    await service.inspectAuthenticationState();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(chrome.getAuthToken.mock.calls.at(-1)?.[0].interactive).toBe(false);
  });
});

describe('Required authorization failure cleanup (AC-AUTH-004/009, AC-DATA-015/016 service subset)', () => {
  it('second 401 fences and deletes all Authorized Data with confirmed-invalid reason', async () => {
    const before = await seed();
    fetcher.mockImplementation(() => Promise.resolve(json({}, 401)));
    await expect(service.validateAuthorization()).rejects.toMatchObject({ code: 'auth-required',
      cleanup: { deletion: 'succeeded', cacheInvalidation: 'succeeded', persistence: 'succeeded' } });
    await assertDeleted();
    const control = await repository.readControl();
    expect(control.lastCleanupReason).toBe('authorization-invalid');
    await expect(repository.saveOwner(owner(), before.fence, now)).rejects.toMatchObject({ code: 'stale-write' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('missing silent token invokes authorization-invalid cleanup, without opening consent', async () => {
    await seed(); chrome.getAuthToken.mockResolvedValue({});
    await expect(service.validateAuthorization()).rejects.toMatchObject({ code: 'auth-required' });
    await assertDeleted();
    expect(fetcher).not.toHaveBeenCalled();
    expect(chrome.getAuthToken.mock.calls.every(([details]) => details.interactive === false)).toBe(true);
  });
  it('exhausted required network verification deletes with unverified reason, not external-revoke claim', async () => {
    await seed(); fetcher.mockRejectedValue(new Error(TOKEN_A));
    await expect(service.validateAuthorization()).rejects.toMatchObject({ code: 'network', cleanup: { deletion: 'succeeded' } });
    await assertDeleted();
    expect((await repository.readControl()).lastCleanupReason).toBe('authorization-unverified');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('ordinary request failure outside a required service check leaves eligible data intact', async () => {
    const before = await seed();
    await service.validateAuthorization();
    const validated = await repository.readSnapshot(now);
    fetcher.mockRejectedValue(new Error('offline'));
    await expect(requests.bootstrapSilently(new AbortController().signal)).rejects.toMatchObject({ code: 'network' });
    expect((await repository.readSnapshot(now)).videos).toEqual(before.videos);
    expect(await repository.readSnapshot(now)).toEqual(validated);
  });
  it('failed authorization cleanup retains inaccessible intent and retries locally on next session', async () => {
    await seed(); fetcher.mockResolvedValue(json({}, 401));
    vi.spyOn(db.sync, 'clear').mockRejectedValueOnce(new Error('delete failed'));
    await expect(service.validateAuthorization()).rejects.toMatchObject({ cleanup: { deletion: 'failed' } });
    expect(await db.videos.count()).toBe(1);
    await expect(repository.readSnapshot(now)).rejects.toMatchObject({ code: 'cleanup-pending' });
    const next = new AuthenticationService(repository, requests, () => now);
    await expect(next.inspectAuthenticationState()).resolves.toEqual({ status: 'auth-required' });
    await assertDeleted();
  });
  it('an intervening mirror revision cannot prevent cleanup of the same failed authorization context', async () => {
    await seed(); const response = held<Response>();
    fetcher.mockReturnValueOnce(response.promise).mockImplementation(() => Promise.resolve(json({}, 401)));
    const checking = service.validateAuthorization();
    const rejection = expect(checking).rejects.toMatchObject({ cleanup: { deletion: 'succeeded', persistence: 'succeeded' } });
    await reachRemote();
    const current = await repository.readSnapshot(now);
    await repository.upsertVideos([video('new')], current.fence, now);
    response.resolve(json({}, 401)); await rejection;
    await assertDeleted();
  });
  it('interrupted invalid-authorization cleanup retains cache intent for restart recovery', async () => {
    await seed();
    await repository.beginCleanup('authorization-invalid', await repository.readControl());
    await service.recoverCleanup();
    await assertDeleted();
    expect(chrome.clearAllCachedAuthTokens).toHaveBeenCalledTimes(1);
    expect((await repository.readControl()).cacheInvalidationStatus).toBe('succeeded');
  });
});

describe('Disconnect and recovery (AC-AUTH-006–009, AC-DATA-010/015 service subset)', () => {
  it('durably fences, deletes owner/membership/sync and independently records revoke/cache success', async () => {
    const before = await seed();
    await expect(service.disconnect()).resolves.toMatchObject({ completed: true, revocation: 'succeeded',
      cacheInvalidation: 'succeeded', deletion: 'succeeded', fencing: 'succeeded', statusPersistence: 'succeeded' });
    await assertDeleted();
    expect(await repository.readControl()).toMatchObject({ dataGeneration: before.control.dataGeneration + 1,
      authEpoch: before.control.authEpoch + 1, revocationStatus: 'succeeded', cacheInvalidationStatus: 'succeeded', deletionStatus: 'succeeded' });
    const calls = chrome.getAuthToken.mock.calls.length;
    await expect(new AuthenticationService(repository, requests, () => now).inspectAuthenticationState()).resolves.toEqual({ status: 'auth-required' });
    expect(chrome.getAuthToken).toHaveBeenCalledTimes(calls);
    await expect(service.connectInteractively()).resolves.toMatchObject({ status: 'authorized', ownerComparison: 'NO_LOCAL_OWNER' });
    const reconnected = await repository.readSnapshot(now);
    expect(reconnected.owner).toBeNull(); expect(reconnected.sync).toBeNull(); expect(reconnected.videos).toEqual([]);
  });
  it('deletes before held revoke resolves; new Connect stays busy until remote operation finishes', async () => {
    await seed(); const remote = held<Response>();
    fetcher.mockReturnValue(remote.promise);
    const disconnecting = service.disconnect();
    await reachRemote();
    await vi.waitFor(async () => expect(await db.videos.count()).toBe(0));
    await expect(service.connectInteractively()).rejects.toMatchObject({ code: 'storage' });
    await expect(service.disconnect()).rejects.toMatchObject({ code: 'busy' });
    remote.resolve(new Response(null));
    await expect(disconnecting).resolves.toMatchObject({ completed: true });
  });
  it('remote revoke failure still deletes immediately and reports incomplete Disconnect', async () => {
    await seed(); fetcher.mockResolvedValue(json({}, 400));
    await expect(service.disconnect()).resolves.toMatchObject({ completed: false, revocation: 'failed',
      deletion: 'succeeded', cacheInvalidation: 'succeeded' });
    await assertDeleted();
    expect((await repository.readControl()).revocationStatus).toBe('failed');
  });
  it('local deletion failure cannot prevent revoke/cache attempts; reopening retries deletion, not revoke', async () => {
    await seed();
    vi.spyOn(db.sync, 'clear').mockRejectedValueOnce(new Error('deletion failed'));
    await expect(service.disconnect()).resolves.toMatchObject({ completed: false, deletion: 'failed',
      revocation: 'succeeded', cacheInvalidation: 'succeeded' });
    expect(await db.videos.count()).toBe(1);
    await expect(repository.readSnapshot(now)).rejects.toMatchObject({ code: 'cleanup-pending' });
    expect(await repository.readControl()).toMatchObject({ pendingCleanupReason: 'disconnect', deletionStatus: 'failed', revocationStatus: 'succeeded' });
    db.close(); await db.open();
    const next = new AuthenticationService(repository, requests, () => now);
    await expect(next.inspectAuthenticationState()).resolves.toEqual({ status: 'auth-required' });
    await assertDeleted();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('missing token never proves revocation; cache is still invalidated and dataset deleted', async () => {
    await seed(); chrome.getAuthToken.mockResolvedValue({});
    await expect(service.disconnect()).resolves.toMatchObject({ completed: false, revocation: 'unconfirmed',
      deletion: 'succeeded', cacheInvalidation: 'succeeded' });
    await assertDeleted();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('cache failure remains independent, is persisted and is retried on recovery', async () => {
    await seed();
    chrome.clearAllCachedAuthTokens.mockRejectedValueOnce(new Error(TOKEN_A));
    await expect(service.disconnect()).resolves.toMatchObject({ completed: false, revocation: 'succeeded', cacheInvalidation: 'failed', deletion: 'succeeded' });
    expect((await repository.readControl()).cacheInvalidationStatus).toBe('failed');
    await service.recoverCleanup();
    expect((await repository.readControl()).cacheInvalidationStatus).toBe('succeeded');
    expect(chrome.clearAllCachedAuthTokens).toHaveBeenCalledTimes(2);
  });
  it('interrupted remote pending outcome becomes unconfirmed after restart and never a fabricated success', async () => {
    await seed();
    await repository.beginCleanup('disconnect', await repository.readControl());
    await expect(service.inspectAuthenticationState()).resolves.toEqual({ status: 'auth-required' });
    await assertDeleted();
    expect(await repository.readControl()).toMatchObject({ revocationStatus: 'unconfirmed', cacheInvalidationStatus: 'succeeded' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('recovery still clears cache when another local deletion attempt fails and blocks Connect', async () => {
    await seed();
    await repository.beginCleanup('disconnect', await repository.readControl());
    vi.spyOn(db.sync, 'clear').mockRejectedValueOnce(new Error('delete failed'));
    await expect(service.recoverCleanup()).rejects.toMatchObject({ code: 'storage' });
    expect(chrome.clearAllCachedAuthTokens).toHaveBeenCalledTimes(1);
    expect(await repository.readControl()).toMatchObject({ deletionStatus: 'failed', cacheInvalidationStatus: 'succeeded', revocationStatus: 'unconfirmed' });
    vi.spyOn(db.sync, 'clear').mockRejectedValueOnce(new Error('delete still failed'));
    await expect(service.connectInteractively()).rejects.toMatchObject({ code: 'storage' });
    expect(chrome.getAuthToken).not.toHaveBeenCalled();
  });
  it('fencing failure still attempts remote revoke/cache and truthfully blocks this service instance', async () => {
    await seed();
    vi.spyOn(repository, 'beginCleanup').mockRejectedValueOnce(new Error(TOKEN_A));
    await expect(service.disconnect()).resolves.toMatchObject({ completed: false, fencing: 'failed', deletion: 'failed',
      revocation: 'succeeded', cacheInvalidation: 'succeeded', statusPersistence: 'failed' });
    expect(await db.videos.count()).toBe(1);
    await expect(service.inspectAuthenticationState()).rejects.toMatchObject({ code: 'storage' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('outcome persistence failure cannot become successful Disconnect', async () => {
    await seed();
    vi.spyOn(repository, 'recordAuthenticationTeardown').mockRejectedValueOnce(new Error('status failed'));
    await expect(service.disconnect()).resolves.toMatchObject({ completed: false, deletion: 'succeeded', statusPersistence: 'failed' });
    await assertDeleted();
    expect((await repository.readControl()).revocationStatus).toBe('pending');
  });
  it('Disconnect supersedes pending expiry and closes the authorization gate', async () => {
    await seed();
    await repository.beginCleanup('expiry', await repository.readControl());
    await expect(service.disconnect()).resolves.toMatchObject({ completed: true });
    await assertDeleted();
    expect((await repository.readControl()).lastCleanupReason).toBe('disconnect');
  });
  it('Disconnect aborts held Connect and prevents its late completion from reopening authorization', async () => {
    const response = held<Response>();
    fetcher.mockImplementation((url: string) => url === REVOCATION_URL ? Promise.resolve(new Response(null)) : response.promise);
    const connecting = service.connectInteractively();
    const rejection = expect(connecting).rejects.toMatchObject({ code: 'cancelled' });
    await reachRemote();
    await expect(service.disconnect()).resolves.toMatchObject({ completed: true });
    response.resolve(json()); await rejection;
    await assertDeleted();
  });
  it('authorization-check persistence fails without returning trusted authorization', async () => {
    await seed();
    vi.spyOn(repository, 'recordAuthorizationCheck').mockRejectedValueOnce(new AuthenticationError('storage'));
    await expect(service.validateAuthorization()).rejects.toMatchObject({ code: 'storage' });
  });
});
