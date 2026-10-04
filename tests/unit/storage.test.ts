import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LikedexDatabase, SINGLETON_KEY } from '@/src/storage/database';
import { LibraryRepository } from '@/src/storage/repository';
import type { LibrarySnapshot } from '@/src/domain/contracts';
import { ATTEMPT_ID, NEXT_ATTEMPT_ID, NOW, OBSERVED, attempt, freshness, owner, success, video } from '../fixtures/storage';

let db: LikedexDatabase;
let repository: LibraryRepository;
let snapshot: LibrarySnapshot;
let indexedDB: IDBFactory;
beforeEach(async () => {
  // A fresh IDB factory, not just fresh JS objects, isolates every test.
  indexedDB = new IDBFactory();
  db = new LikedexDatabase('likedex', { indexedDB, IDBKeyRange });
  repository = new LibraryRepository(db);
  await repository.initialize();
  snapshot = await repository.readSnapshot(NOW);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});
async function seed(): Promise<void> {
  snapshot = await repository.saveOwner(owner(), snapshot.fence, NOW);
  snapshot = await repository.saveCurrentAttempt(attempt(), snapshot.fence, NOW);
  snapshot = await repository.upsertVideos([video(), video('video-b')], snapshot.fence, NOW);
  snapshot = await repository.saveLatestSuccessfulSync(success(), snapshot.fence, NOW);
}

describe('Phase 2 local repository (AC-STORAGE-001–005 storage portions)', () => {
  it('opens the canonical database with one schema and genuinely empty data', async () => {
    expect(db.name).toBe('likedex');
    expect(db.verno).toBe(1);
    expect(db.tables.map((table) => table.name).sort()).toEqual(['control', 'owner', 'sync', 'videos']);
    expect(snapshot.owner).toBeNull();
    expect(snapshot.videos).toEqual([]);
    expect(snapshot.sync).toBeNull();
    expect(snapshot.earliestExpiresAt).toBeNull();
    expect(snapshot.control.connectionGate).toBe('disconnected');
  });

  it('round trips owner, videos, attempts, latest success and provenance across reopen', async () => {
    await seed();
    db.close();
    await db.open();
    const reopened = await new LibraryRepository(db).readSnapshot(NOW);
    expect(reopened).toEqual(snapshot);
    expect(reopened.owner?.channelId).toBe('owner-a');
    expect(reopened.videos).toEqual([video(), video('video-b')]);
    expect(reopened.sync?.currentAttempt).toEqual(attempt());
    expect(reopened.sync?.latestSuccessfulSync).toEqual(success());
  });

  it('upserts only supplied membership and preserves explicit unknowns (AC-RECON-010 storage)', async () => {
    await seed();
    const known = video('video-a', { title: 'Updated title', publishedAt: OBSERVED,
      metadataFetchedAt: OBSERVED, metadataFreshness: { ...video().metadataFreshness,
        title: freshness(), publishedAt: freshness() } });
    snapshot = await repository.upsertVideos([known], snapshot.fence, NOW);
    expect(snapshot.videos).toEqual([known, video('video-b')]);
    expect(snapshot.videos[0]?.likedAt).toBeNull();
    expect(snapshot.videos[1]?.durationSeconds).toBeNull();
  });

  it.each([
    { state: 'available', evidence: 'public' },
    { state: 'unavailable', evidence: 'private' },
    { state: 'unavailable', evidence: 'deleted' },
    { state: 'unknown', evidence: 'lookup-omitted' },
  ] as const)('keeps availability $state/$evidence without deleting membership (AC-RECON-009 storage)', async (availability) => {
    await seed();
    const record = video('video-a', { availability, metadataFetchedAt: OBSERVED,
      metadataFreshness: { ...video().metadataFreshness, availability: freshness() } });
    snapshot = await repository.upsertVideos([record], snapshot.fence, NOW);
    expect(snapshot.videos[0]).toEqual(record);
    expect(snapshot.videos).toHaveLength(2);
  });

  it.each(['failure', 'interrupted'] as const)('preserves latest success after a later %s (AC-SYNC-007 storage)', async (state) => {
    await seed();
    snapshot = await repository.saveCurrentAttempt(attempt({ state: 'success', finishedAt: OBSERVED }), snapshot.fence, NOW);
    snapshot = await repository.saveCurrentAttempt(attempt({ attemptId: NEXT_ATTEMPT_ID }), snapshot.fence, NOW);
    snapshot = await repository.saveCurrentAttempt(attempt({ attemptId: NEXT_ATTEMPT_ID, state, finishedAt: NOW,
      updatedAt: NOW }), snapshot.fence, NOW);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(success());
    expect(snapshot.sync?.previousCompletedResult?.attemptId).toBe(ATTEMPT_ID);
  });

  it('retains only one preceding terminal result across repeated attempts (AC-STORAGE-005)', async () => {
    await seed();
    for (const attemptId of [ATTEMPT_ID, NEXT_ATTEMPT_ID, '00000000-0000-4000-8000-000000000005']) {
      snapshot = await repository.saveCurrentAttempt(attempt({ attemptId, state: 'failure', finishedAt: OBSERVED }), snapshot.fence, NOW);
    }
    expect(await db.sync.count()).toBe(1);
    expect(snapshot.sync?.previousCompletedResult?.attemptId).toBe(NEXT_ATTEMPT_ID);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(success());
  });

  it('cannot displace active work with another attempt', async () => {
    await seed();
    await expect(repository.saveCurrentAttempt(attempt({ attemptId: NEXT_ATTEMPT_ID }), snapshot.fence, NOW))
      .rejects.toMatchObject({ code: 'attempt-mismatch' });
    expect(await repository.readSnapshot(NOW)).toEqual(snapshot);
  });

  it('round trips sanitized errors and terminal progress independently of latest success', async () => {
    await seed();
    const terminal = attempt({ state: 'partial', finishedAt: NOW, updatedAt: NOW,
      pagesAccepted: 1, rawItems: 2, uniqueMembership: 2, safeCommits: 1,
      error: { category: 'network', messageKey: 'network-failed', phase: 'scanning' } });
    snapshot = await repository.saveCurrentAttempt(terminal, snapshot.fence, NOW);
    expect((await repository.readSnapshot(NOW)).sync?.currentAttempt).toEqual(terminal);
    expect(snapshot.sync?.latestSuccessfulSync).toEqual(success());
  });

  it('rejects another owner even with the same display name (AC-IDENTITY-001/005 storage)', async () => {
    await seed();
    await expect(repository.saveOwner(owner('owner-b'), snapshot.fence, NOW)).rejects.toMatchObject({ code: 'owner-mismatch' });
    await expect(repository.upsertVideos([video('foreign', { ownerChannelId: 'owner-b' })], snapshot.fence, NOW))
      .rejects.toMatchObject({ code: 'owner-mismatch' });
    expect(await repository.readSnapshot(NOW)).toEqual(snapshot);
  });

  it('commits video records, checkpoint and revision together; stale replay cannot double count (AC-STORAGE-002 portion)', async () => {
    await seed();
    const before = snapshot;
    const checkpoint = attempt({ pagesAccepted: 1, rawItems: 3, uniqueMembership: 3, safeCommits: 1 });
    snapshot = await repository.upsertVideos([video('new')], before.fence, NOW, checkpoint);
    expect(snapshot.sync?.currentAttempt).toEqual(checkpoint);
    expect(snapshot.control.revision).toBe(before.control.revision + 1);
    expect(snapshot.sync?.lastMirrorChangeRevision).toBe(snapshot.control.revision);
    await expect(repository.upsertVideos([video('new')], before.fence, NOW, checkpoint)).rejects.toMatchObject({ code: 'stale-write' });
    expect(await repository.readSnapshot(NOW)).toEqual(snapshot);
  });

  it('rolls back records, checkpoint and revision on failure after bulk upsert (AC-STORAGE-002/003)', async () => {
    await seed();
    vi.spyOn(db.sync, 'put').mockRejectedValueOnce(new Error('injected persistence failure'));
    await expect(repository.upsertVideos([video('new')], snapshot.fence, NOW,
      attempt({ pagesAccepted: 1, rawItems: 1, uniqueMembership: 1, safeCommits: 1 }))).rejects.toMatchObject({ code: 'persistence' });
    expect(await repository.readSnapshot(NOW)).toEqual(snapshot);
  });

  it('reads a coherent committed snapshot through another database connection (AC-STORAGE-004 portion)', async () => {
    await seed();
    const second = new LikedexDatabase('likedex', { indexedDB, IDBKeyRange });
    try {
      const [updated, observed] = await Promise.all([
        repository.upsertVideos([video('new')], snapshot.fence, NOW),
        new LibraryRepository(second).readSnapshot(NOW),
      ]);
      expect([snapshot.control.revision, updated.control.revision]).toContain(observed.control.revision);
      expect(observed.videos.length).toBe(observed.control.revision === updated.control.revision ? 3 : 2);
      expect(observed.owner).toEqual(owner());
    } finally { second.close(); }
  });

  it('propagates storage read errors as typed failures instead of empty data (AC-STORAGE-003)', async () => {
    await seed();
    vi.spyOn(db.videos, 'toArray').mockRejectedValueOnce(new Error('private driver details'));
    await expect(repository.readSnapshot(NOW)).rejects.toMatchObject({ code: 'persistence', message: 'Likedex storage: persistence' });
    expect(await repository.readSnapshot(NOW)).toEqual(snapshot);
  });

  it('rejects missing control around retained records instead of resetting fences', async () => {
    await seed();
    await db.control.delete(SINGLETON_KEY);
    await expect(repository.initialize()).rejects.toMatchObject({ code: 'invalid-data' });
  });
});

describe('Explicit local deletion and fencing (AC-DATA-005/007/015 storage portions)', () => {
  it('atomically clears every mirror record, preserves connection intent and fences late writes', async () => {
    snapshot = await repository.saveConnectionState({ connectionGate: 'connected', authorizationCheckDueAt: '2026-10-05T12:00:00.000Z' }, snapshot.fence, NOW);
    snapshot = await repository.saveOwner(owner(), snapshot.fence, NOW);
    snapshot = await repository.saveCurrentAttempt(attempt({ authEpoch: 1 }), snapshot.fence, NOW);
    snapshot = await repository.upsertVideos([video()], snapshot.fence, NOW);
    const before = snapshot;
    const cleared = await repository.clearLocalData(before.fence);
    expect(cleared.connectionGate).toBe('connected');
    expect(cleared.authEpoch).toBe(1);
    expect(cleared.dataGeneration).toBe(1);
    expect(cleared.lastCleanupReason).toBe('clear');
    const empty = await repository.readSnapshot(NOW);
    expect(empty.owner).toBeNull();
    expect(empty.videos).toEqual([]);
    expect(empty.sync).toBeNull();
    await expect(repository.saveOwner(owner(), before.fence, NOW)).rejects.toMatchObject({ code: 'stale-write' });
    await expect(repository.clearLocalData(before.fence)).rejects.toMatchObject({ code: 'stale-write' });
    await repository.clearLocalData(empty.fence);
    expect((await repository.readSnapshot(NOW)).videos).toEqual([]);
  });

  it('rolls Clear back completely if deletion fails', async () => {
    await seed();
    vi.spyOn(db.sync, 'clear').mockRejectedValueOnce(new Error('delete failed'));
    await expect(repository.clearLocalData(snapshot.fence)).rejects.toMatchObject({ code: 'persistence' });
    expect(await repository.readSnapshot(NOW)).toEqual(snapshot);
  });

  it('persists cleanup intent, blocks access/writes, survives failure/reopen, then deletes all derived data', async () => {
    await seed();
    let control = await repository.beginCleanup('disconnect', snapshot.fence);
    expect(control.connectionGate).toBe('disconnected');
    expect(control.authEpoch).toBe(1);
    expect(control.revocationStatus).toBe('pending');
    expect(control.cacheInvalidationStatus).toBe('pending');
    await expect(repository.readSnapshot(NOW)).rejects.toMatchObject({ code: 'cleanup-pending' });
    await expect(repository.upsertVideos([video('late')], snapshot.fence, NOW)).rejects.toMatchObject({ code: 'cleanup-pending' });
    vi.spyOn(db.sync, 'clear').mockRejectedValueOnce(new Error('delete failed'));
    await expect(repository.finishCleanup(control)).rejects.toMatchObject({ code: 'persistence' });
    expect(await db.videos.count()).toBe(2);
    control = await repository.readControl();
    expect(control.deletionStatus).toBe('failed');
    expect(control.pendingCleanupReason).toBe('disconnect');
    db.close();
    await db.open();
    await expect(repository.readSnapshot(NOW)).rejects.toMatchObject({ code: 'cleanup-pending' });
    await expect(repository.enforceRetention(NOW)).resolves.toBe('deleted');
    const empty = await repository.readSnapshot(NOW);
    expect(empty.owner).toBeNull();
    expect(empty.sync).toBeNull();
    expect(empty.videos).toEqual([]);
    expect(empty.control.lastCleanupReason).toBe('disconnect');
    // Local deletion neither fabricates nor completes remote outcomes.
    expect(empty.control.revocationStatus).toBe('pending');
    expect(empty.control.cacheInvalidationStatus).toBe('pending');
  });

  it('rejects a fence for the wrong epoch/owner/attempt even at the current revision', async () => {
    await seed();
    for (const [patch, code] of [
      [{ authEpoch: 99 }, 'stale-write'], [{ ownerChannelId: 'owner-b' }, 'owner-mismatch'],
      [{ attemptId: NEXT_ATTEMPT_ID }, 'attempt-mismatch'],
    ] as const) {
      await expect(repository.upsertVideos([video('new')], { ...snapshot.fence, ...patch }, NOW)).rejects.toMatchObject({ code });
    }
    expect(await repository.readSnapshot(NOW)).toEqual(snapshot);
  });

  it('rejects an old attempt after an auth-epoch change even with a refreshed write fence', async () => {
    await seed();
    snapshot = await repository.saveConnectionState({ connectionGate: 'connected',
      authorizationCheckDueAt: '2026-10-05T00:00:00.000Z' }, snapshot.fence, NOW);
    await expect(repository.upsertVideos([video('late')], snapshot.fence, NOW)).rejects.toMatchObject({ code: 'stale-write' });
  });

  it('never claims deletion failure was saved if the failure-status write also fails (AC-STORAGE-003)', async () => {
    await seed();
    const pending = await repository.beginCleanup('authorization-invalid', snapshot.fence);
    vi.spyOn(db.videos, 'clear').mockRejectedValueOnce(new Error('delete failed'));
    vi.spyOn(db.control, 'put').mockRejectedValueOnce(new Error('status save failed'));
    await expect(repository.finishCleanup(pending)).rejects.toMatchObject({ code: 'persistence' });
    const persisted = await repository.readControl();
    expect(persisted.deletionStatus).toBe('pending');
    expect(persisted.pendingCleanupReason).toBe('authorization-invalid');
    await expect(repository.readSnapshot(NOW)).rejects.toMatchObject({ code: 'cleanup-pending' });
  });
});

describe('Local retention foundation (AC-DATA-011–015 storage portions)', () => {
  it('uses the earliest retained fact, including older metadata after fresh membership updates', async () => {
    await seed();
    const old = freshness('2026-09-10T20:00:00.000Z');
    const record = video('video-a', { title: 'Old title', metadataFetchedAt: old.observedAt,
      metadataFreshness: { ...video().metadataFreshness, title: old } });
    snapshot = await repository.upsertVideos([record], snapshot.fence, NOW);
    expect(snapshot.earliestExpiresAt).toBe('2026-10-10T00:00:00.000Z');
    const refreshedMembership = video('video-a', { ...record, membershipObservedAt: NOW, membershipFreshness: freshness(NOW) });
    snapshot = await repository.upsertVideos([refreshedMembership], snapshot.fence, NOW);
    expect(snapshot.earliestExpiresAt).toBe(old.expiresAt);
    snapshot = await repository.saveLatestSuccessfulSync({ ...success(), completedAt: NOW, freshness: freshness(NOW) }, snapshot.fence, NOW);
    expect(snapshot.earliestExpiresAt).toBe(old.expiresAt);
    expect((await repository.readSnapshot(NOW)).videos[0]?.metadataFreshness.title).toEqual(old);
  });

  it('includes prior results in retention instead of renewing historical evidence on a new attempt', async () => {
    await seed();
    const old = freshness('2026-09-06T12:00:00.000Z');
    snapshot = await repository.saveCurrentAttempt(attempt({ state: 'failure', finishedAt: NOW,
      freshness: old }), snapshot.fence, NOW);
    snapshot = await repository.saveCurrentAttempt(attempt({ attemptId: NEXT_ATTEMPT_ID, freshness: freshness(NOW) }), snapshot.fence, NOW);
    expect(snapshot.earliestExpiresAt).toBe(old.expiresAt);
  });

  it('rejects expired reads/writes, deletes at the exact boundary, and enforces after inactivity', async () => {
    await seed();
    await repository.readSnapshot('2026-10-14T23:59:59.999Z');
    const deadline = '2026-10-15T00:00:00.000Z';
    await expect(repository.readSnapshot(deadline)).rejects.toMatchObject({ code: 'expired' });
    await expect(repository.upsertVideos([video('late')], snapshot.fence, deadline)).rejects.toMatchObject({ code: 'expired' });
    db.close();
    await db.open();
    expect(await repository.enforceRetention('2026-11-01T12:00:00.000Z')).toBe('deleted');
    const empty = await repository.readSnapshot('2026-11-01T12:00:00.000Z');
    expect(empty.videos).toEqual([]);
    expect(empty.owner).toBeNull();
    expect(empty.sync).toBeNull();
    expect(empty.control.lastCleanupReason).toBe('expiry');
  });

  it('rejects missing provenance on write/read and permits explicit cleanup of corrupt records', async () => {
    await seed();
    const invalid = video('bad', { title: 'Known without provenance' });
    await expect(repository.upsertVideos([invalid], snapshot.fence, NOW)).rejects.toMatchObject({ code: 'invalid-input' });
    await db.videos.put(invalid);
    await expect(repository.readSnapshot(NOW)).rejects.toMatchObject({ code: 'invalid-data' });
    expect(await repository.enforceRetention(NOW)).toBe('deleted');
    expect((await repository.readSnapshot(NOW)).owner).toBeNull();
  });

  it('rolls back an upsert whose retained metadata is already expired', async () => {
    await seed();
    const expired = freshness('2026-08-01T12:00:00.000Z');
    const record = video('new', { title: 'Expired metadata', metadataFetchedAt: expired.observedAt,
      metadataFreshness: { ...video().metadataFreshness, title: expired } });
    await expect(repository.upsertVideos([record], snapshot.fence, NOW)).rejects.toMatchObject({ code: 'expired' });
    expect(await repository.readSnapshot(NOW)).toEqual(snapshot);
  });

  it('does not delete data for an infrastructure read failure', async () => {
    await seed();
    vi.spyOn(db.videos, 'toArray').mockRejectedValueOnce(new Error('read unavailable'));
    await expect(repository.enforceRetention(NOW)).rejects.toMatchObject({ code: 'persistence' });
    expect(await repository.readSnapshot(NOW)).toEqual(snapshot);
  });

  it('blocks a backward clock across reopen without extending freshness', async () => {
    await seed();
    await repository.readSnapshot('2026-10-05T00:00:00.000Z');
    db.close();
    await db.open();
    await expect(repository.readSnapshot(NOW)).rejects.toMatchObject({ code: 'clock-unverified' });
    await expect(repository.enforceRetention(NOW)).rejects.toMatchObject({ code: 'clock-unverified' });
    expect(await db.videos.count()).toBe(2);
    expect((await repository.readSnapshot('2026-10-05T00:00:00.000Z')).earliestExpiresAt).toBe(snapshot.earliestExpiresAt);
  });

  it('rejects extra fields including auth internals at the persistence boundary', async () => {
    await seed();
    const unsafeOwner = { ...owner(), accessToken: 'synthetic-forbidden-field' };
    await expect(repository.saveOwner(unsafeOwner, snapshot.fence, NOW))
      .rejects.toMatchObject({ code: 'invalid-input' });
  });
});
