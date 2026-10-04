import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChromeIdentityAdapter } from '@/src/auth/chrome-identity';
import { AuthenticationError } from '@/src/auth/errors';
import { GoogleAuthorizationRequests, type VerifiedSyncOwner } from '@/src/auth/google-requests';
import { canTransition } from '@/src/domain/synchronization';
import { retentionDeadline } from '@/src/domain/freshness';
import { ProviderError } from '@/src/provider/errors';
import { YouTubeLikedVideosProvider, type TrustedProviderCompletion } from '@/src/provider/youtube-ingestion';
import { LikedexDatabase } from '@/src/storage/database';
import { LibraryRepository, StorageError } from '@/src/storage/repository';
import { SynchronizationService, syncError } from '@/src/sync/service';
import { bootstrap, channelResponse, chromeIdentity, held, json, timing } from '../fixtures/authentication';
import { member, membershipPage, metadata, videoId, videosPage } from '../fixtures/provider';
import { ATTEMPT_ID, NOW, OBSERVED, attempt, freshness, owner, success, video } from '../fixtures/storage';

const WORKER = '00000000-0000-4000-8000-000000000090';
const OTHER_WORKER = '00000000-0000-4000-8000-000000000091';
const REQUEST = '00000000-0000-4000-8000-000000000092';
const databases: LikedexDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map((db) => db.delete())); });

async function setup(bodies: unknown[] = [], seedIds: number[] | null = null) {
  const db = new LikedexDatabase('likedex', { indexedDB: new IDBFactory(), IDBKeyRange });
  databases.push(db);
  const repository = new LibraryRepository(db);
  await repository.initialize();
  let snapshot = await repository.readSnapshot(NOW);
  snapshot = await repository.saveConnectionState({ connectionGate: 'connected',
    authorizationCheckDueAt: '2026-10-05T12:00:00.000Z' }, snapshot.fence, NOW);
  const previousSuccess = { ...success(), rawRemoteCount: seedIds?.length ?? 0, uniqueRemoteCount: seedIds?.length ?? 0,
    localMembershipCount: seedIds?.length ?? 0, localAvailableCount: 0, addedCount: seedIds?.length ?? 0 };
  if (seedIds !== null) {
    snapshot = await repository.saveOwner(owner(), snapshot.fence, NOW);
    snapshot = await repository.saveCurrentAttempt(attempt({ authEpoch: snapshot.control.authEpoch }), snapshot.fence, NOW);
    snapshot = await repository.upsertVideos(seedIds.map((id) => video(videoId(id))), snapshot.fence, NOW);
    snapshot = await repository.saveCurrentAttempt(attempt({ authEpoch: snapshot.control.authEpoch,
      state: 'success', finishedAt: OBSERVED }), snapshot.fence, NOW);
    snapshot = await repository.saveLatestSuccessfulSync(previousSuccess, snapshot.fence, NOW);
  }
  const fetcher = vi.fn<(...args: [string, RequestInit]) => Promise<Response>>();
  for (const body of bodies) fetcher.mockResolvedValueOnce(body instanceof Response ? body : json(body));
  const chrome = chromeIdentity();
  const clock = timing();
  const requests = new GoogleAuthorizationRequests(new ChromeIdentityAdapter(chrome), fetcher, clock);
  let sequence = 10;
  const service = new SynchronizationService(repository, requests, WORKER, () => NOW,
    () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`);
  return { db, repository, snapshot, previousSuccess, fetcher, chrome, clock, requests, service };
}
function full(ids: number[]) {
  return [channelResponse(), membershipPage(ids.map((id) => member(id))),
    ...(ids.length ? [videosPage(ids.map((id) => metadata(id)))] : []), channelResponse()];
}
async function finish(h: Awaited<ReturnType<typeof setup>>) {
  const launch = await h.service.start(REQUEST);
  expect(launch.status).toBe('started');
  expect(launch.attempt.state).toBe('preparing');
  expect(launch.completion).not.toBeNull();
  const result = await launch.completion!;
  return { result, snapshot: await h.repository.readSnapshot(NOW), launch };
}

describe('Full sync and page application (AC-SYNC-001/002/005; AC-RECON-001/002/005/008/009)', () => {
  it('binds the owner on first sync and atomically commits membership, progress, evidence and success', async () => {
    const h = await setup(full([1, 2]));
    const phases: string[] = [];
    const transition = h.repository.transitionSyncAttempt.bind(h.repository);
    vi.spyOn(h.repository, 'transitionSyncAttempt').mockImplementation(async (...args) => {
      const snapshot = await transition(...args); phases.push(snapshot.sync!.currentAttempt!.state); return snapshot;
    });
    const { result, snapshot } = await finish(h);
    expect(result.status).toBe('success');
    expect(snapshot.owner?.channelId).toBe(bootstrap.channelId);
    expect(snapshot.videos.map((record) => record.videoId)).toEqual([videoId(1), videoId(2)]);
    expect(phases).toEqual(['scanning', 'applying', 'finalizing']);
    expect(snapshot.sync?.currentAttempt).toMatchObject({ state: 'success', pagesAccepted: 1, safeCommits: 1,
      completionEvidence: { acceptedPages: 1, rawItems: 2, uniqueMembership: 2 } });
    expect(snapshot.sync?.latestSuccessfulSync).toMatchObject({ rawRemoteCount: 2, uniqueRemoteCount: 2,
      localMembershipCount: 2, localAvailableCount: 2, addedCount: 2, updatedCount: 0, removedCount: 0 });
    expect(snapshot.sync?.lastFinalizedMirrorRevision).toBe(snapshot.control.revision);
    expect(snapshot.sync?.lastMirrorChangeRevision).toBe(snapshot.control.revision);
    expect(h.chrome.getAuthToken.mock.calls.every(([options]) => options.interactive === false)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('synthetic-token');
  });
  it.each([
    { old: [1], remote: [1, 2], added: 1, removed: 0 },
    { old: [1], remote: [1, 2, 3], added: 2, removed: 0 },
    { old: [1, 2], remote: [1], added: 0, removed: 1 },
    { old: [1, 2, 3], remote: [1], added: 0, removed: 2 },
    { old: [1, 2, 3], remote: [], added: 0, removed: 3 },
  ])('reconciles $old -> $remote with truthful added/removed counts', async ({ old, remote, added, removed }) => {
    const h = await setup(full(remote), old);
    const { snapshot, result } = await finish(h);
    expect(result.status).toBe('success');
    expect(snapshot.videos.map((record) => record.videoId)).toEqual(remote.map((id) => videoId(id)));
    expect(snapshot.sync?.latestSuccessfulSync).toMatchObject({ addedCount: added, removedCount: removed,
      updatedCount: remote.filter((id) => old.includes(id)).length, localMembershipCount: remote.length,
      uniqueRemoteCount: remote.length });
  });
  it('retains a page update before later pages and counts cross-page duplicate videos once', async () => {
    const h = await setup([channelResponse(), membershipPage([member(1)], 'next', 3), videosPage([metadata(1)]),
      membershipPage([member(2, videoId(1)), member(3)], undefined, 3), videosPage([metadata(1), metadata(3)]), channelResponse()]);
    const apply = h.repository.applyProviderPage.bind(h.repository);
    const commits: number[] = [];
    vi.spyOn(h.repository, 'applyProviderPage').mockImplementation(async (...args) => {
      const snapshot = await apply(...args); commits.push(snapshot.sync!.currentAttempt!.safeCommits); return snapshot;
    });
    const { snapshot, result } = await finish(h);
    expect(result.status).toBe('success');
    expect(commits).toEqual([1, 2]);
    expect(snapshot.videos[0]?.membershipSourceIds).toEqual(['source-1', 'source-2']);
    expect(snapshot.sync?.latestSuccessfulSync).toMatchObject({ rawRemoteCount: 3, uniqueRemoteCount: 2,
      addedCount: 2, updatedCount: 0, removedCount: 0, pageCount: 2 });
  });
  it.each(['lookup-omitted', 'private', 'deleted'] as const)('keeps liked membership with %s metadata', async (evidence) => {
    const meta = metadata(1);
    const item = evidence === 'private' ? { ...meta, status: { ...meta.status, privacyStatus: 'private' } }
      : { ...meta, status: { ...meta.status, uploadStatus: 'deleted' } };
    const h = await setup([channelResponse(), membershipPage(), videosPage(evidence === 'lookup-omitted' ? [] : [item]), channelResponse()], [1, 2]);
    const { result, snapshot } = await finish(h);
    expect(result.status).toBe('success');
    expect(snapshot.videos).toHaveLength(1);
    expect(snapshot.videos[0]?.availability.evidence).toBe(evidence);
    expect(snapshot.sync?.latestSuccessfulSync).toMatchObject({ uniqueRemoteCount: 1, localMembershipCount: 1, localAvailableCount: 0, removedCount: 1 });
  });
  it('updates metadata and preserves an omitted eligible old field with its original deadline (AC-DATA-012)', async () => {
    const meta = metadata(1);
    const { description, ...withoutDescription } = meta.snippet;
    expect(description).toBe('Description');
    const h = await setup([channelResponse(), membershipPage(), { ...videosPage([]), items: [{ ...meta,
      snippet: { ...withoutDescription, title: 'New title' } }] }, channelResponse()], [1]);
    const old = video(videoId(1), { description: 'Old description', metadataFetchedAt: OBSERVED,
      metadataFreshness: { ...video().metadataFreshness, description: freshness() } });
    await h.db.videos.put(old);
    const { result, snapshot } = await finish(h);
    expect(result.status).toBe('success');
    expect(snapshot.videos[0]).toMatchObject({ title: 'New title', description: 'Old description',
      metadataFreshness: { description: freshness(), title: freshness(NOW) }, membershipFreshness: freshness(NOW) });
    expect(snapshot.earliestExpiresAt).toBe(freshness().expiresAt);
    expect(snapshot.sync?.latestSuccessfulSync?.freshness.expiresAt).toBe(freshness().expiresAt);
  });
  it('starts every retry at page one and preserves the preceding terminal result (AC-SYNC-002; AC-STORAGE-005)', async () => {
    const h = await setup([...full([1]), ...full([1, 2])]);
    const first = await finish(h);
    const second = await finish(h);
    expect(second.result.status).toBe('success');
    expect(second.snapshot.sync?.previousCompletedResult?.attemptId).toBe(first.launch.attempt.attemptId);
    const pageCalls = h.fetcher.mock.calls.filter(([url]) => new URL(url).pathname.endsWith('/playlistItems'));
    expect(pageCalls).toHaveLength(2);
    expect(pageCalls.every(([url]) => !new URL(url).searchParams.has('pageToken'))).toBe(true);
  });
});

describe('Failure truth and rollback (AC-SYNC-006/007; AC-RECON-003/004/007/011/012; AC-STORAGE-002/003)', () => {
  it('malformed empty before the first page preserves all membership and previous success', async () => {
    const h = await setup([channelResponse(), { kind: 'youtube#playlistItemListResponse', pageInfo: { totalResults: 0, resultsPerPage: 0 } }], [1, 2, 3]);
    const { result, snapshot } = await finish(h);
    expect(result.status).toBe('failure');
    expect(result.error?.category).toBe('malformed-provider');
    expect(snapshot.videos).toEqual(h.snapshot.videos);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
    expect(snapshot.sync?.currentAttempt).toMatchObject({ state: 'failure', safeCommits: 0, completionEvidence: null });
  });
  it('network failure before any page is failure, never a new empty result', async () => {
    const h = await setup([channelResponse()], [1, 2, 3]);
    h.fetcher.mockRejectedValue(new TypeError('synthetic transport failure'));
    const { result, snapshot } = await finish(h);
    expect(result).toMatchObject({ status: 'failure', error: { category: 'network' } });
    expect(snapshot.videos).toEqual(h.snapshot.videos);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
    expect(h.clock.sleep).toHaveBeenCalledTimes(2);
  });
  it.each(['network', 'malformed', 'pagination'] as const)('safe pages survive a later %s failure with no pruning or success freshness renewal', async (failure) => {
    const end = failure === 'malformed' ? { kind: 'youtube#playlistItemListResponse' }
      : membershipPage([member(2)], 'next', 3);
    const h = await setup([channelResponse(), membershipPage([member(1)], 'next', 3), videosPage([metadata(1)]),
      ...(failure === 'network' ? [] : [end])], [1, 2, 3]);
    if (failure === 'network') h.fetcher.mockRejectedValue(new TypeError('synthetic network failure'));
    const { result, snapshot } = await finish(h);
    expect(result.status).toBe('partial');
    expect(snapshot.videos.map((record) => record.videoId)).toEqual([1, 2, 3].map((id) => videoId(id)));
    expect(snapshot.videos[0]?.title).toBe('Video 1');
    expect(snapshot.videos[1]?.membershipFreshness).toEqual(freshness());
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
    expect(snapshot.sync?.currentAttempt).toMatchObject({ safeCommits: 1, pagesAccepted: 1,
      completionEvidence: null, updatedCount: 1 });
    expect(snapshot.sync?.lastFinalizedMirrorRevision).toBeNull();
    expect(snapshot.sync?.latestSuccessfulSync?.removedCount).toBe(0);
  });
  it('rolls back a first page write and its checkpoint when storage fails', async () => {
    const h = await setup(full([1, 4]), [1, 2, 3]);
    vi.spyOn(h.db.videos, 'bulkPut').mockRejectedValueOnce(new Error('synthetic driver failure'));
    const { result, snapshot } = await finish(h);
    expect(result).toMatchObject({ status: 'failure', error: { category: 'persistence', phase: 'applying' } });
    expect(snapshot.videos).toEqual(h.snapshot.videos);
    expect(snapshot.sync?.currentAttempt).toMatchObject({ pagesAccepted: 0, safeCommits: 0 });
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
  });
  it('a later page write failure preserves only earlier committed progress', async () => {
    const h = await setup([channelResponse(), membershipPage([member(1)], 'next', 2), videosPage([metadata(1)]),
      membershipPage([member(4)], undefined, 2), videosPage([metadata(4)])], [1, 2, 3]);
    const put = h.db.videos.bulkPut.bind(h.db.videos);
    vi.spyOn(h.db.videos, 'bulkPut').mockImplementationOnce(put).mockRejectedValueOnce(new Error('synthetic write failure'));
    const { result, snapshot } = await finish(h);
    expect(result.status).toBe('partial');
    expect(snapshot.videos.map((record) => record.videoId)).toEqual([1, 2, 3].map((id) => videoId(id)));
    expect(snapshot.sync?.currentAttempt).toMatchObject({ pagesAccepted: 1, safeCommits: 1, uniqueMembership: 1 });
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
  });
  it.each(['delete', 'success-metadata'] as const)('finalization %s failure rolls back pruning and success together', async (failure) => {
    const h = await setup(full([1]), [1, 2, 3]);
    if (failure === 'delete') vi.spyOn(h.db.videos, 'bulkDelete').mockRejectedValueOnce(new Error('synthetic delete failure'));
    else {
      const put = h.db.sync.put.bind(h.db.sync);
      vi.spyOn(h.db.sync, 'put').mockImplementation((...args) => {
        if (args[0].currentAttempt?.state === 'success' && args[0].currentAttempt.attemptId !== ATTEMPT_ID) {
          return put(...args).then(() => { throw new Error('synthetic final metadata failure'); });
        }
        return put(...args);
      });
    }
    const { result, snapshot } = await finish(h);
    expect(result).toMatchObject({ status: 'partial', error: { category: 'persistence', phase: 'finalizing' } });
    expect(snapshot.videos.map((record) => record.videoId)).toEqual([1, 2, 3].map((id) => videoId(id)));
    expect(snapshot.videos[0]?.title).toBe('Video 1');
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
    expect(snapshot.sync?.lastFinalizedMirrorRevision).toBeNull();
    expect(snapshot.sync?.currentAttempt?.completionEvidence).toBeNull();
  });
  it('discloses unsaved status if even failure recording fails, leaving recoverable active truth', async () => {
    const h = await setup([channelResponse(), { kind: 'youtube#playlistItemListResponse' }], [1]);
    vi.spyOn(h.repository, 'finishSyncAttempt').mockRejectedValueOnce(new StorageError('persistence'));
    const { result, snapshot } = await finish(h);
    expect(result.status).toBe('status-unsaved');
    expect(snapshot.sync?.currentAttempt?.state).toBe('scanning');
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
  });
  it.each([
    ['quota', 'quota'], ['rate-limit', 'rate-limit'], ['unavailable', 'provider'], ['network', 'network'],
    ['malformed-provider', 'malformed-provider'], ['owner-mismatch', 'owner-mismatch'],
  ] as const)('preserves %s error category as %s', (code, category) => {
    expect(syncError(new AuthenticationError(code), 'scanning')).toMatchObject({ category, phase: 'scanning' });
  });
  it('distinguishes pagination anomalies and unexpected errors without leaking sensitive strings', () => {
    expect(syncError(new ProviderError('pagination-integrity'), 'scanning').category).toBe('untrusted-enumeration');
    const result = syncError(new Error('sensitive raw detail'), 'applying');
    expect(result.category).toBe('internal');
    expect(JSON.stringify(result)).not.toContain('sensitive');
  });
});

describe('Start, ownership, cancellation and recovery (service/storage portions of AC-SYNC-003/004/008/012; AC-IDENTITY-005)', () => {
  it('acknowledges durable preparing while owner bootstrap is held; simultaneous starts join one task', async () => {
    const h = await setup();
    const remote = held<Response>();
    h.fetcher.mockReturnValueOnce(remote.promise);
    const secondService = new SynchronizationService(h.repository, h.requests, WORKER, () => NOW);
    const [first, second] = await Promise.all([h.service.start(REQUEST), secondService.start(REQUEST)]);
    expect([first.status, second.status].sort()).toEqual(['already-active', 'started']);
    expect(first.attempt.attemptId).toBe(second.attempt.attemptId);
    expect((await h.repository.readSnapshot(NOW)).sync?.currentAttempt?.state).toBe('preparing');
    const joined = await h.service.start(REQUEST);
    expect(joined.status).toBe('already-active');
    expect(joined.completion).toBe(first.completion);
    remote.resolve(json(channelResponse()));
    h.fetcher.mockResolvedValueOnce(json(membershipPage([]))).mockResolvedValueOnce(json(channelResponse()));
    expect((await first.completion!)?.status).toBe('success');
    expect(h.fetcher.mock.calls.filter(([url]) => url.includes('/playlistItems'))).toHaveLength(1);
  });
  it('rejects disconnected start without an attempt or provider call', async () => {
    const h = await setup();
    const before = await h.repository.readSnapshot(NOW);
    await h.repository.saveConnectionState({ connectionGate: 'disconnected', authorizationCheckDueAt: null }, before.fence, NOW);
    await expect(h.service.start(REQUEST)).rejects.toMatchObject({ code: 'auth-required' });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect((await h.repository.readSnapshot(NOW)).sync).toBeNull();
  });
  it('initial owner mismatch makes zero membership writes and preserves prior success', async () => {
    const response = channelResponse();
    response.items[0]!.id = 'owner-b';
    const h = await setup([response], [1, 2, 3]);
    const { result, snapshot } = await finish(h);
    expect(result).toMatchObject({ status: 'failure', error: { category: 'owner-mismatch' } });
    expect(snapshot.videos).toEqual(h.snapshot.videos);
    expect(snapshot.owner).toEqual(h.snapshot.owner);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it('final remote owner mismatch stops pruning after safe writes', async () => {
    const response = channelResponse(); response.items[0]!.id = 'owner-b';
    const h = await setup([channelResponse(), membershipPage(), videosPage(), response], [1, 2, 3]);
    const { result, snapshot } = await finish(h);
    expect(result).toMatchObject({ status: 'partial', error: { category: 'owner-mismatch' } });
    expect(snapshot.videos).toHaveLength(3);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
  });
  it('Clear fences a delayed bootstrap, preventing repopulation or failure metadata resurrection', async () => {
    const h = await setup([], [1, 2, 3]);
    const remote = held<Response>(); h.fetcher.mockReturnValueOnce(remote.promise);
    const launch = await h.service.start(REQUEST);
    await h.repository.clearLocalData(await h.repository.readControl());
    remote.resolve(json(channelResponse()));
    expect((await launch.completion!)?.status).toBe('superseded');
    const snapshot = await h.repository.readSnapshot(NOW);
    expect(snapshot.videos).toEqual([]); expect(snapshot.owner).toBeNull(); expect(snapshot.sync).toBeNull();
  });
  it('recovers another worker active attempt as interrupted, retaining safe pages and previous success', async () => {
    const h = await setup([], [1, 2, 3]);
    const claim = await h.repository.claimSyncAttempt({ attemptId: '00000000-0000-4000-8000-000000000093',
      workerInstanceId: OTHER_WORKER, requestId: REQUEST }, NOW);
    const active = claim.snapshot.sync!.currentAttempt!;
    const progress = { ...active, state: 'scanning' as const, pagesAccepted: 1, safeCommits: 1, rawItems: 1, uniqueMembership: 1 };
    await h.repository.upsertVideos([video(videoId(4), { lastSeenAttemptId: active.attemptId })], claim.snapshot.fence, NOW, progress);
    const snapshot = await h.service.recoverInterruption();
    expect(snapshot.sync?.currentAttempt).toMatchObject({ state: 'interrupted', safeCommits: 1, error: { category: 'interrupted' } });
    expect(snapshot.videos).toHaveLength(4);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
    for (const body of full([1])) h.fetcher.mockResolvedValueOnce(json(body));
    const retry = await finish(h);
    expect(retry.result.status).toBe('success');
    expect(new URL(h.fetcher.mock.calls[1]![0]).searchParams.has('pageToken')).toBe(false);
  });
  it('recovery leaves same-worker active truth and committed terminal success unchanged', async () => {
    const h = await setup(full([]));
    const { snapshot } = await finish(h);
    expect(await h.service.recoverInterruption()).toEqual(snapshot);
    const claim = await h.repository.claimSyncAttempt({ attemptId: REQUEST, workerInstanceId: WORKER, requestId: REQUEST }, NOW);
    expect(await h.service.recoverInterruption()).toEqual(claim.snapshot);
  });
  it('cancellation yields interruption without terminal capability or pruning', async () => {
    const h = await setup([], [1, 2, 3]);
    const remote = held<Response>(); h.fetcher.mockReturnValueOnce(remote.promise);
    const launch = await h.service.start(REQUEST);
    h.service.cancel(launch.attempt.attemptId);
    remote.resolve(json(channelResponse()));
    expect((await launch.completion!)?.status).toBe('interrupted');
    const snapshot = await h.repository.readSnapshot(NOW);
    expect(snapshot.videos).toEqual(h.snapshot.videos);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
  });
  it('authorization loss during ingestion invokes named cleanup rather than reconciliation', async () => {
    const h = await setup([channelResponse(), new Response('', { status: 401 }), channelResponse(), new Response('', { status: 401 })], [1, 2, 3]);
    const launch = await h.service.start(REQUEST);
    const result = await launch.completion!;
    expect(result).toMatchObject({ status: 'cleanup', cleanup: { deletion: 'succeeded', cacheInvalidation: 'succeeded' } });
    const snapshot = await h.repository.readSnapshot(NOW);
    expect(snapshot.control.lastCleanupReason).toBe('authorization-invalid');
    expect(snapshot.control.connectionGate).toBe('disconnected');
    expect(snapshot.sync).toBeNull(); expect(snapshot.videos).toEqual([]);
  });
});

// Exercise the actual provider and actual repository boundary directly so a
// service-only safety guard cannot conceal an unsafe destructive transaction.
async function readyFinalization() {
  const h = await setup([], [1, 2, 3]);
  for (const body of full([1])) h.fetcher.mockResolvedValueOnce(json(body));
  const claim = await h.repository.claimSyncAttempt({ attemptId: REQUEST, requestId: REQUEST, workerInstanceId: WORKER }, NOW);
  let snapshot = claim.snapshot;
  const scope = { attemptId: REQUEST, dataGeneration: snapshot.control.dataGeneration, authEpoch: snapshot.control.authEpoch };
  const session = h.requests.createYouTubeSyncSession(scope, new AbortController().signal, NOW);
  const initialOwner = await session.verifyOwner();
  snapshot = await h.repository.bindSyncOwner(initialOwner, snapshot.fence, NOW);
  snapshot = await h.repository.transitionSyncAttempt('scanning', snapshot.fence, NOW);
  let proof: TrustedProviderCompletion | undefined;
  for await (const event of new YouTubeLikedVideosProvider(h.requests).enumerateLikedVideos({ ...scope, owner: bootstrap }, new AbortController().signal, session)) {
    if (event.kind === 'page') {
      snapshot = await h.repository.transitionSyncAttempt('applying', snapshot.fence, NOW);
      snapshot = await h.repository.applyProviderPage(event, snapshot.fence, NOW);
    } else proof = event;
  }
  snapshot = await h.repository.transitionSyncAttempt('finalizing', snapshot.fence, NOW);
  const finalOwner = await session.verifyOwner();
  return { ...h, snapshot, proof: proof!, initialOwner, finalOwner, session };
}

describe('Destructive capability and fences (AC-RECON-012/013/014; AC-IDENTITY-005; AC-DATA-012/013)', () => {
  it.each(['boolean', 'spread', 'serialized', 'partial', 'undefined'] as const)('rejects %s completion at the repository boundary without mutation', async (kind) => {
    const h = await readyFinalization();
    const fake: unknown = kind === 'boolean' ? true : kind === 'spread' ? { ...h.proof }
      : kind === 'serialized' ? JSON.parse(JSON.stringify(h.proof)) as unknown : kind === 'partial' ? { complete: true } : undefined;
    await expect(h.repository.finalizeTrustedEnumeration(fake, h.snapshot.fence, NOW, h.finalOwner)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(await h.repository.readSnapshot(NOW)).toEqual(h.snapshot);
  });
  it.each(['missing', 'structural', 'initial-only'] as const)('requires genuine post-enumeration owner validation: %s', async (kind) => {
    const h = await readyFinalization();
    const check = kind === 'missing' ? undefined : kind === 'initial-only' ? h.initialOwner : { ...h.finalOwner } as VerifiedSyncOwner;
    await expect(h.repository.finalizeTrustedEnumeration(h.proof, h.snapshot.fence, NOW, check)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(await h.repository.readSnapshot(NOW)).toEqual(h.snapshot);
  });
  it.each(['generation', 'epoch', 'attempt', 'owner', 'revision'] as const)('rejects a wrong %s fence and performs no pruning', async (kind) => {
    const h = await readyFinalization();
    const wrong = { ...h.snapshot.fence,
      ...(kind === 'generation' ? { dataGeneration: 7 } : kind === 'epoch' ? { authEpoch: 8 }
        : kind === 'attempt' ? { attemptId: ATTEMPT_ID } : kind === 'owner' ? { ownerChannelId: 'owner-b' } : { revision: 0 }) };
    await expect(h.repository.finalizeTrustedEnumeration(h.proof, wrong, NOW, h.finalOwner)).rejects.toBeInstanceOf(StorageError);
    expect(await h.repository.readSnapshot(NOW)).toEqual(h.snapshot);
  });
  it('rejects completion after interruption even with a refreshed matching revision', async () => {
    const h = await readyFinalization();
    const snapshot = await h.repository.recoverSyncInterruption(OTHER_WORKER, NOW);
    await expect(h.repository.finalizeTrustedEnumeration(h.proof, snapshot.fence, NOW, h.finalOwner)).rejects.toMatchObject({ code: 'attempt-mismatch' });
    expect(await h.repository.readSnapshot(NOW)).toEqual(snapshot);
  });
  it('rejects progress claiming success without all durable pages', async () => {
    const h = await readyFinalization();
    const snapshot = await h.repository.saveCurrentAttempt({ ...h.snapshot.sync!.currentAttempt!, safeCommits: 0 }, h.snapshot.fence, NOW);
    await expect(h.repository.finalizeTrustedEnumeration(h.proof, snapshot.fence, NOW, h.finalOwner)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(await h.repository.readSnapshot(NOW)).toEqual(snapshot);
  });
  it('committed success survives worker recovery and the completion cannot be replayed', async () => {
    const h = await readyFinalization();
    const successSnapshot = await h.repository.finalizeTrustedEnumeration(h.proof, h.snapshot.fence, NOW, h.finalOwner);
    expect(await h.repository.recoverSyncInterruption(OTHER_WORKER, NOW)).toEqual(successSnapshot);
    await expect(h.repository.finalizeTrustedEnumeration(h.proof, successSnapshot.fence, NOW, h.finalOwner)).rejects.toMatchObject({ code: 'attempt-mismatch' });
  });
  it('blocks expired finalization and deletes expired metadata on recovery without claiming remote removal', async () => {
    const h = await readyFinalization();
    const expiry = freshness().expiresAt;
    await expect(h.repository.finalizeTrustedEnumeration(h.proof, h.snapshot.fence, expiry, h.finalOwner)).rejects.toMatchObject({ code: 'expired' });
    const recovered = await h.repository.recoverSyncInterruption(OTHER_WORKER, expiry);
    expect(recovered.control.lastCleanupReason).toBe('expiry');
    expect(recovered.control.connectionGate).toBe('connected');
    expect(recovered.videos).toEqual([]); expect(recovered.sync).toBeNull();
  });
  it('prevents replay of a committed page', async () => {
    const h = await readyFinalization();
    await expect(h.repository.applyProviderPage({ kind: 'page', pageNumber: 1, terminal: true,
      records: [], progress: { pagesAccepted: 1, rawItems: 1, uniqueMembership: 1, duplicateVideoItems: 0, estimatedTotal: 1 } },
    h.snapshot.fence, NOW)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(await h.repository.readSnapshot(NOW)).toEqual(h.snapshot);
  });
  it('fresh first-sync membership and success inherit only real provider observation deadlines', async () => {
    const h = await setup(full([1]));
    const { snapshot } = await finish(h);
    expect(snapshot.videos[0]?.membershipFreshness).toEqual(freshness(NOW));
    expect(snapshot.sync?.latestSuccessfulSync?.freshness).toEqual(freshness(NOW));
    expect(snapshot.earliestExpiresAt).toBe(retentionDeadline(NOW));
  });
  it('rejects transitions from terminal states and follows the approved active phases', () => {
    expect(canTransition('preparing', 'scanning')).toBe(true);
    expect(canTransition('applying', 'finalizing')).toBe(true);
    expect(canTransition('success', 'scanning')).toBe(false);
    expect(canTransition('failure', 'success')).toBe(false);
  });
});

describe('Whole-attempt bounds and cleanup (AC-SYNC-009/010; AC-AUTH-004; AC-DATA-015/016)', () => {
  it('shares six additional retries across preparation, membership, hydration and final owner validation', async () => {
    const transient = () => new Response('', { status: 503 });
    const h = await setup([transient(), transient(), channelResponse(), transient(), transient(), membershipPage(),
      transient(), transient(), videosPage(), transient()], [1, 2, 3]);
    const launch = await h.service.start(REQUEST);
    const result = await launch.completion!;
    expect(result).toMatchObject({ status: 'cleanup', error: { category: 'provider' } });
    expect(h.clock.sleep).toHaveBeenCalledTimes(6);
    expect(h.fetcher).toHaveBeenCalledTimes(10);
    expect((await h.repository.readControl()).lastCleanupReason).toBe('authorization-unverified');
  });
  it('allows at most one stale-token recovery across bootstrap and ingestion', async () => {
    const h = await setup([new Response('', { status: 401 }), channelResponse(), new Response('', { status: 401 })], [1]);
    const launch = await h.service.start(REQUEST);
    expect((await launch.completion!)?.status).toBe('cleanup');
    expect(h.fetcher).toHaveBeenCalledTimes(3);
    expect(h.chrome.removeCachedAuthToken).toHaveBeenCalledTimes(2);
    expect(h.chrome.getAuthToken).toHaveBeenCalledTimes(3);
  });
  it('daily quota during ingestion is failure without retries or policy deletion', async () => {
    const h = await setup([channelResponse(), json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403)], [1, 2, 3]);
    const { result, snapshot } = await finish(h);
    expect(result).toMatchObject({ status: 'failure', error: { category: 'quota' } });
    expect(h.clock.sleep).not.toHaveBeenCalled();
    expect(snapshot.videos).toEqual(h.snapshot.videos);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
    expect(snapshot.control.pendingCleanupReason).toBeNull();
  });
  it('time spent applying pages counts toward the ten-minute attempt budget', async () => {
    const h = await setup(full([1]), [1, 2, 3]);
    let elapsed = 0;
    h.clock.now = () => Date.parse(NOW) + elapsed;
    const apply = h.repository.applyProviderPage.bind(h.repository);
    vi.spyOn(h.repository, 'applyProviderPage').mockImplementation(async (...args) => {
      const snapshot = await apply(...args); elapsed = 600_000; return snapshot;
    });
    const { result, snapshot } = await finish(h);
    expect(result).toMatchObject({ status: 'partial', error: { category: 'provider' } });
    expect(snapshot.videos).toHaveLength(3);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
    expect(h.fetcher).toHaveBeenCalledTimes(3);
  });
  it('backward clock movement during page application cannot produce completion', async () => {
    const h = await setup(full([1]), [1, 2, 3]);
    let elapsed = 0;
    h.clock.now = () => Date.parse(NOW) + elapsed;
    const apply = h.repository.applyProviderPage.bind(h.repository);
    vi.spyOn(h.repository, 'applyProviderPage').mockImplementation(async (...args) => {
      const snapshot = await apply(...args); elapsed = -1; return snapshot;
    });
    const { result, snapshot } = await finish(h);
    expect(result.status).toBe('partial');
    expect(snapshot.videos).toHaveLength(3);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(h.previousSuccess);
  });
  it('a required check failure reports deletion failure separately and keeps the data gate closed', async () => {
    const h = await setup([new Response('', { status: 401 }), new Response('', { status: 401 })], [1, 2, 3]);
    vi.spyOn(h.db.videos, 'clear').mockRejectedValueOnce(new Error('synthetic deletion failure'));
    const launch = await h.service.start(REQUEST);
    expect(await launch.completion!).toMatchObject({ status: 'cleanup', cleanup: { deletion: 'failed', cacheInvalidation: 'succeeded' } });
    await expect(h.repository.readSnapshot(NOW)).rejects.toMatchObject({ code: 'cleanup-pending' });
    expect((await h.repository.readControl()).deletionStatus).toBe('failed');
    expect(h.chrome.clearAllCachedAuthTokens).toHaveBeenCalled();
  });
});
