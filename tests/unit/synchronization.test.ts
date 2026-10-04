import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { expect, it, vi } from 'vitest';
import { ChromeIdentityAdapter } from '@/src/auth/chrome-identity';
import { GoogleAuthorizationRequests } from '@/src/auth/google-requests';
import type { LibrarySnapshot, WriteFence } from '@/src/domain/contracts';
import { YouTubeLikedVideosProvider, isTrustedProviderCompletion } from '@/src/provider/youtube-ingestion';
import { LikedexDatabase } from '@/src/storage/database';
import { LibraryRepository, StorageError } from '@/src/storage/repository';
import { bootstrap, chromeIdentity, json, timing } from '../fixtures/authentication';
import { member, membershipPage, metadata, videoId, videosPage } from '../fixtures/provider';
import { NEXT_ATTEMPT_ID, NOW, OBSERVED, attempt, owner, success, video } from '../fixtures/storage';

// Test-first contract for the still-missing Phase 5 destructive boundary. Using
// an optional member keeps this RED an assertion, not an import/typecheck error.
type FinalizerContract = {
  finalizeTrustedEnumeration?: (proof: unknown, fence: WriteFence, now: string) => Promise<LibrarySnapshot>;
};

it('untrusted or incomplete provider enumeration must never authorize local membership pruning (AC-RECON-003/004/014; AC-SYNC-007)', async () => {
  const db = new LikedexDatabase('likedex', { indexedDB: new IDBFactory(), IDBKeyRange });
  const repository = new LibraryRepository(db);
  try {
    await repository.initialize();
    let snapshot = await repository.readSnapshot(NOW);
    snapshot = await repository.saveConnectionState({ connectionGate: 'connected',
      authorizationCheckDueAt: '2026-10-05T12:00:00.000Z' }, snapshot.fence, NOW);
    snapshot = await repository.saveOwner(owner(), snapshot.fence, NOW);
    const authEpoch = snapshot.control.authEpoch;
    snapshot = await repository.saveCurrentAttempt(attempt({ authEpoch }), snapshot.fence, NOW);
    const ids = [videoId(1), videoId(2), videoId(3)]; // A, B, C
    snapshot = await repository.upsertVideos(ids.map((id) => video(id)), snapshot.fence, NOW);
    const previousSuccess = { ...success(), rawRemoteCount: 3, uniqueRemoteCount: 3,
      localMembershipCount: 3, localAvailableCount: 0, addedCount: 3 };
    snapshot = await repository.saveLatestSuccessfulSync(previousSuccess, snapshot.fence, NOW);
    snapshot = await repository.saveCurrentAttempt(attempt({ authEpoch, state: 'success',
      finishedAt: OBSERVED }), snapshot.fence, NOW);
    snapshot = await repository.saveCurrentAttempt(attempt({ authEpoch, attemptId: NEXT_ATTEMPT_ID,
      startedAt: NOW, updatedAt: NOW }), snapshot.fence, NOW);

    const fetcher = vi.fn<(...args: [string, RequestInit]) => Promise<Response>>()
      .mockResolvedValueOnce(json(membershipPage([member(1), member(2)], 'next', 3)))
      .mockResolvedValueOnce(json(videosPage([metadata(1), metadata(2)])))
      // HTTP 200, superficially empty, but the required items container is absent.
      .mockResolvedValueOnce(json({ kind: 'youtube#playlistItemListResponse',
        pageInfo: { resultsPerPage: 0, totalResults: 0 } }));
    const provider = new YouTubeLikedVideosProvider(new GoogleAuthorizationRequests(
      new ChromeIdentityAdapter(chromeIdentity()), fetcher, timing()));
    const context = { owner: bootstrap, attemptId: NEXT_ATTEMPT_ID,
      dataGeneration: snapshot.control.dataGeneration, authEpoch };
    const iterator = provider.enumerateLikedVideos(context, new AbortController().signal);
    const first = await iterator.next();
    expect(first.done).toBe(false);
    if (first.value?.kind !== 'page') throw new Error('Expected the validated A/B page');
    const page = first.value;
    expect(page.records.map((record) => record.videoId)).toEqual(ids.slice(0, 2));
    const checkpoint = { ...snapshot.sync!.currentAttempt!, ...page.progress, safeCommits: 1,
      updatedAt: NOW };
    // duplicateVideoItems is provider-only progress, not a durable attempt field.
    const { duplicateVideoItems: _duplicates, ...durableCheckpoint } = checkpoint;
    expect(_duplicates).toBe(0);
    snapshot = await repository.upsertVideos(page.records, snapshot.fence, NOW, durableCheckpoint);
    await expect(iterator.next()).rejects.toMatchObject({ code: 'malformed-response' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(isTrustedProviderCompletion(page)).toBe(false);

    const beforeFinalization = await repository.readSnapshot(NOW);
    expect(beforeFinalization.videos.map((record) => record.videoId).sort()).toEqual(ids);
    expect(beforeFinalization.videos.find((record) => record.videoId === ids[0])?.title).toBe('Video 1');
    expect(beforeFinalization.sync?.currentAttempt?.safeCommits).toBe(1);
    expect(beforeFinalization.sync?.latestSuccessfulSync).toEqual(previousSuccess);

    // A structurally plausible terminal summary for only A/B cannot replace the
    // genuine provider capability that the failed page chain never produced.
    const fabricatedCompletion = { kind: 'trusted-complete', validatorRevision: 1,
      scope: { attemptId: context.attemptId, ownerChannelId: bootstrap.channelId,
        likesPlaylistId: bootstrap.likesPlaylistId, dataGeneration: context.dataGeneration, authEpoch },
      progress: page.progress, membershipVideoIds: ids.slice(0, 2),
      pageChain: [{ pageNumber: 1, rawItems: 2, observedAt: NOW, terminal: true }],
      terminalPageObservedAt: NOW };
    expect(isTrustedProviderCompletion(fabricatedCompletion)).toBe(false);
    const finalizer = (repository as LibraryRepository & FinalizerContract).finalizeTrustedEnumeration;
    expect(finalizer, 'Phase 5 must provide a finalizer that rejects untrusted completion before any pruning')
      .toBeTypeOf('function');
    if (finalizer === undefined) throw new Error('Missing Phase 5 finalizer');
    await expect(finalizer.call(repository, fabricatedCompletion, snapshot.fence, NOW))
      .rejects.toBeInstanceOf(StorageError);
    expect(await repository.readSnapshot(NOW)).toEqual(beforeFinalization);
  } finally {
    await db.delete();
  }
});
