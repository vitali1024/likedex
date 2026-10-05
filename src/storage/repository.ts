import { z } from 'zod';
import {
  attemptSchema, cleanupReasonSchema, controlSchema, fenceSchema, instantSchema, isActiveAttempt, latestSuccessSchema,
  ownerSchema, retainedFreshness, syncSchema, videoSchema,
  type CleanupReason, type ControlState, type LatestSuccessfulSync, type LibrarySnapshot,
  type MirroredVideo, type RemoteOwner, type SyncAttempt, type SyncMetadata, type WriteFence,
} from '../domain/contracts';
import { LikedexDatabase, SINGLETON_KEY } from './database';
import { isTrustedProviderCompletion, type ProviderPage } from '../provider/youtube-ingestion';
import { isVerifiedSyncOwner, type VerifiedSyncOwner } from '../auth/google-requests';
import { attemptOutcome, canTransition, derivedFreshness, mergeObservedVideo } from '../domain/synchronization';
import type { DomainError } from '../domain/contracts';

export type StorageErrorCode = 'persistence' | 'invalid-input' | 'invalid-data' | 'stale-write'
  | 'owner-mismatch' | 'attempt-mismatch' | 'cleanup-pending' | 'expired' | 'clock-unverified';
export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    // Deliberately do not attach database records or raw driver exceptions.
    super(`Likedex storage: ${code}`);
    this.name = 'StorageError';
  }
}

// A live supplier is sampled inside the transaction, after queued work and
// state reads. Explicit instants remain useful for deterministic callers.
export type RepositoryTime = string | (() => string);
function transactionTime(time: RepositoryTime): string {
  return parse(instantSchema, typeof time === 'function' ? time() : time, 'invalid-input');
}

export type ControlFence = Pick<WriteFence, 'dataGeneration' | 'authEpoch' | 'revision'>;
const controlFenceSchema = fenceSchema.pick({ dataGeneration: true, authEpoch: true, revision: true });
const emptyControl = (): ControlState => ({
  dataGeneration: 0, revision: 0, connectionGate: 'disconnected', authEpoch: 0,
  revocationStatus: 'not-requested', cacheInvalidationStatus: 'not-requested',
  deletionStatus: 'not-requested', pendingCleanupReason: null, lastCleanupReason: null,
  authorizationCheckDueAt: null, lastClockSeenAt: null,
});
const emptySync = (): SyncMetadata => ({
  currentAttempt: null, previousCompletedResult: null, latestSuccessfulSync: null,
  lastMirrorChangeRevision: 0, lastFinalizedMirrorRevision: null,
});

function parse<T>(schema: z.ZodType<T>, value: unknown, code: 'invalid-input' | 'invalid-data'): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new StorageError(code);
  return result.data;
}
function increment(value: number): number {
  if (!Number.isSafeInteger(value + 1)) throw new StorageError('invalid-data');
  return value + 1;
}
function assertControlFence(control: ControlState, expected: ControlFence): void {
  parse(controlFenceSchema, { dataGeneration: expected.dataGeneration,
    authEpoch: expected.authEpoch, revision: expected.revision }, 'invalid-input');
  if (control.dataGeneration !== expected.dataGeneration || control.authEpoch !== expected.authEpoch
    || control.revision !== expected.revision) throw new StorageError('stale-write');
}

export class LibraryRepository {
  private notifiedRevision = -1;
  constructor(private readonly db: LikedexDatabase,
    private readonly onRevision: (control: ControlState) => void = () => {}) {}

  private async operation<T>(run: () => Promise<T>): Promise<T> {
    try {
      const result = await run();
      // Read after the transaction commits. Notification is a best-effort hint;
      // a dropped hint cannot change the successful durable operation's result.
      try {
        const control = await this.db.control.get(SINGLETON_KEY);
        if (control && control.revision > this.notifiedRevision) {
          this.notifiedRevision = control.revision; this.onRevision(control);
        }
      } catch { /* Authoritative reads remain independently fallible. */ }
      return result;
    }
    catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('persistence');
    }
  }

  private async control(): Promise<ControlState> {
    const value = await this.db.control.get(SINGLETON_KEY);
    if (value !== undefined) return parse(controlSchema, value, 'invalid-data');
    // A lost control record must not reset fences around an existing mirror.
    if (await this.db.owner.count() || await this.db.videos.count() || await this.db.sync.count()) {
      throw new StorageError('invalid-data');
    }
    return emptyControl();
  }

  private async state(): Promise<LibrarySnapshot> {
    const control = await this.control();
    if (control.pendingCleanupReason !== null) throw new StorageError('cleanup-pending');
    const storedOwner = await this.db.owner.get(SINGLETON_KEY);
    const owner = storedOwner === undefined ? null : parse(ownerSchema, storedOwner, 'invalid-data');
    const videos = (await this.db.videos.toArray()).map((video) => parse(videoSchema, video, 'invalid-data'));
    const storedSync = await this.db.sync.get(SINGLETON_KEY);
    const sync = storedSync === undefined ? null : parse(syncSchema, storedSync, 'invalid-data');
    if (videos.some((video) => owner === null || video.ownerChannelId !== owner.channelId)) {
      throw new StorageError('invalid-data');
    }
    for (const record of [sync?.currentAttempt, sync?.previousCompletedResult, sync?.latestSuccessfulSync]) {
      if (record && (record.dataGeneration !== control.dataGeneration
        || (record.ownerChannelId !== null && record.ownerChannelId !== owner?.channelId))) {
        throw new StorageError('invalid-data');
      }
    }
    if (sync && (sync.lastMirrorChangeRevision > control.revision
      || (sync.lastFinalizedMirrorRevision !== null && sync.lastFinalizedMirrorRevision > sync.lastMirrorChangeRevision))) {
      throw new StorageError('invalid-data');
    }
    const earliestExpiresAt = retainedFreshness(owner, videos, sync).map((fact) => fact.expiresAt).sort()[0] ?? null;
    return { control, owner, videos, sync, earliestExpiresAt, fence: {
      dataGeneration: control.dataGeneration, authEpoch: control.authEpoch, revision: control.revision,
      ownerChannelId: owner?.channelId ?? null, attemptId: sync?.currentAttempt?.attemptId ?? null,
    } };
  }

  private assertEligible(snapshot: LibrarySnapshot, now: string): void {
    parse(instantSchema, now, 'invalid-input');
    if (snapshot.control.pendingCleanupReason !== null) throw new StorageError('cleanup-pending');
    if (snapshot.control.lastClockSeenAt !== null && now < snapshot.control.lastClockSeenAt) {
      throw new StorageError('clock-unverified');
    }
    if (retainedFreshness(snapshot.owner, snapshot.videos, snapshot.sync).some((fact) => fact.observedAt > now)) {
      throw new StorageError('clock-unverified');
    }
    if (snapshot.earliestExpiresAt !== null && now >= snapshot.earliestExpiresAt) throw new StorageError('expired');
  }

  private assertFence(snapshot: LibrarySnapshot, expected: WriteFence): void {
    parse(fenceSchema, expected, 'invalid-input');
    assertControlFence(snapshot.control, expected);
    if (expected.ownerChannelId !== snapshot.fence.ownerChannelId) throw new StorageError('owner-mismatch');
    if (expected.attemptId !== snapshot.fence.attemptId) throw new StorageError('attempt-mismatch');
  }

  async initialize(): Promise<ControlState> {
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const control = await this.control();
      await this.db.control.put(control, SINGLETON_KEY);
      return control;
    }));
  }

  async readControl(): Promise<ControlState> {
    return this.operation(() => this.db.transaction('r', this.db.tables, () => this.control()));
  }

  // Release observation preconditions only: no clock bookkeeping, recovery,
  // freshness renewal or writes. The caller must not expose this as a UI DTO.
  async readObservationSnapshot(now: string): Promise<LibrarySnapshot> {
    return this.operation(() => this.db.transaction('r', this.db.tables, async () => {
      const snapshot = await this.state();
      this.assertEligible(snapshot, now);
      return snapshot;
    }));
  }

  // Local freshness/cleanup validation only. The future coordinator MUST also
  // validate authorization before exposing this snapshot to UI or Export.
  async readSnapshot(time: RepositoryTime): Promise<LibrarySnapshot> {
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const snapshot = await this.state();
      const now = transactionTime(time);
      this.assertEligible(snapshot, now);
      snapshot.control.lastClockSeenAt = now;
      await this.db.control.put(snapshot.control, SINGLETON_KEY);
      return snapshot;
    }));
  }

  private async mutate(expected: WriteFence, time: RepositoryTime,
    write: (snapshot: LibrarySnapshot, nextRevision: number, now: string) => Promise<void>): Promise<LibrarySnapshot> {
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const before = await this.state();
      const now = transactionTime(time);
      this.assertEligible(before, now);
      this.assertFence(before, expected);
      const revision = increment(before.control.revision);
      await write(before, revision, now);
      await this.db.control.put({ ...before.control, revision, lastClockSeenAt: now }, SINGLETON_KEY);
      const after = await this.state();
      this.assertEligible(after, now);
      return after;
    }));
  }

  async saveOwner(value: RemoteOwner, expected: WriteFence, time: RepositoryTime): Promise<LibrarySnapshot> {
    const owner = parse(ownerSchema, value, 'invalid-input');
    return this.mutate(expected, time, async (snapshot) => {
      if (snapshot.owner !== null && snapshot.owner.channelId !== owner.channelId) {
        throw new StorageError('owner-mismatch');
      }
      await this.db.owner.put(owner, SINGLETON_KEY);
    });
  }

  // Pure persistence of a future auth adapter's result; no token/API behavior.
  async saveConnectionState(value: Pick<ControlState, 'connectionGate' | 'authorizationCheckDueAt'>,
    expected: WriteFence, time: RepositoryTime): Promise<LibrarySnapshot> {
    const connection = parse(z.strictObject({ connectionGate: controlSchema.shape.connectionGate,
      authorizationCheckDueAt: controlSchema.shape.authorizationCheckDueAt }), value, 'invalid-input');
    return this.mutate(expected, time, async (snapshot) => {
      snapshot.control.connectionGate = connection.connectionGate;
      snapshot.control.authorizationCheckDueAt = connection.authorizationCheckDueAt;
      snapshot.control.authEpoch = increment(snapshot.control.authEpoch);
    });
  }

  // Successful periodic checks do not change auth epoch or refresh API facts.
  async recordAuthorizationCheck(dueAt: string, expected: ControlFence, time: RepositoryTime): Promise<ControlState> {
    parse(instantSchema, dueAt, 'invalid-input');
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const snapshot = await this.state();
      const now = transactionTime(time);
      this.assertEligible(snapshot, now);
      if (dueAt <= now || Date.parse(dueAt) - Date.parse(now) > 24 * 60 * 60 * 1000) throw new StorageError('invalid-input');
      assertControlFence(snapshot.control, expected);
      if (snapshot.control.connectionGate !== 'connected') throw new StorageError('stale-write');
      const next: ControlState = { ...snapshot.control, authorizationCheckDueAt: dueAt,
        lastClockSeenAt: now, revision: increment(snapshot.control.revision) };
      await this.db.control.put(next, SINGLETON_KEY);
      return next;
    }));
  }

  async recordAuthenticationTeardown(value: Pick<ControlState, 'revocationStatus' | 'cacheInvalidationStatus'>,
    expected: ControlFence): Promise<ControlState> {
    const outcomes = parse(z.strictObject({ revocationStatus: controlSchema.shape.revocationStatus,
      cacheInvalidationStatus: controlSchema.shape.cacheInvalidationStatus }), value, 'invalid-input');
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const control = await this.control();
      assertControlFence(control, expected);
      if (control.connectionGate !== 'disconnected') throw new StorageError('stale-write');
      const next: ControlState = { ...control, ...outcomes, revision: increment(control.revision) };
      await this.db.control.put(next, SINGLETON_KEY);
      return next;
    }));
  }

  private assertAttempt(attempt: SyncAttempt, snapshot: LibrarySnapshot): void {
    if (attempt.dataGeneration !== snapshot.control.dataGeneration || attempt.authEpoch !== snapshot.control.authEpoch) {
      throw new StorageError('stale-write');
    }
    if (attempt.ownerChannelId !== (snapshot.owner?.channelId ?? null)) throw new StorageError('owner-mismatch');
  }

  async saveCurrentAttempt(value: SyncAttempt, expected: WriteFence, time: RepositoryTime): Promise<LibrarySnapshot> {
    const attempt = parse(attemptSchema, value, 'invalid-input');
    return this.mutate(expected, time, async (snapshot) => {
      this.assertAttempt(attempt, snapshot);
      const sync = snapshot.sync ?? emptySync();
      if (sync.currentAttempt !== null && sync.currentAttempt.attemptId !== attempt.attemptId) {
        if (isActiveAttempt(sync.currentAttempt.state)) throw new StorageError('attempt-mismatch');
        sync.previousCompletedResult = sync.currentAttempt;
      }
      sync.currentAttempt = attempt;
      await this.db.sync.put(sync, SINGLETON_KEY);
    });
  }

  // Metadata persistence, not finalization. Phase 5 must add an atomic trusted
  // finalizer before any real sync may publish success or remove membership.
  async saveLatestSuccessfulSync(value: LatestSuccessfulSync, expected: WriteFence, time: RepositoryTime): Promise<LibrarySnapshot> {
    const success = parse(latestSuccessSchema, value, 'invalid-input');
    return this.mutate(expected, time, async (snapshot) => {
      if (success.ownerChannelId !== snapshot.owner?.channelId) throw new StorageError('owner-mismatch');
      if (success.dataGeneration !== snapshot.control.dataGeneration) throw new StorageError('stale-write');
      const sync = snapshot.sync ?? emptySync();
      sync.latestSuccessfulSync = success;
      await this.db.sync.put(sync, SINGLETON_KEY);
    });
  }

  // Complete record upserts only, never "replace membership" or implicit pruning.
  // Optional checkpoint commits in the same transaction. Expected revision makes
  // replay of the same local write fail; remote page deduplication is Phase 5.
  async upsertVideos(values: MirroredVideo[], expected: WriteFence, time: RepositoryTime,
    checkpoint?: SyncAttempt): Promise<LibrarySnapshot> {
    const videos = parse(z.array(videoSchema), values, 'invalid-input');
    const attempt = checkpoint === undefined ? undefined : parse(attemptSchema, checkpoint, 'invalid-input');
    if (new Set(videos.map((video) => video.videoId)).size !== videos.length) throw new StorageError('invalid-input');
    return this.mutate(expected, time, async (snapshot, revision) => {
      if (snapshot.owner === null || videos.some((video) => video.ownerChannelId !== snapshot.owner?.channelId)) {
        throw new StorageError('owner-mismatch');
      }
      if (snapshot.sync?.currentAttempt === null || snapshot.sync === null
        || videos.some((video) => video.lastSeenAttemptId !== snapshot.sync?.currentAttempt?.attemptId)) {
        throw new StorageError('attempt-mismatch');
      }
      const sync = snapshot.sync;
      if (sync.currentAttempt === null || !isActiveAttempt(sync.currentAttempt.state)) {
        throw new StorageError('attempt-mismatch');
      }
      this.assertAttempt(sync.currentAttempt, snapshot);
      if (attempt !== undefined) {
        this.assertAttempt(attempt, snapshot);
        if (attempt.attemptId !== sync.currentAttempt?.attemptId) throw new StorageError('attempt-mismatch');
        sync.currentAttempt = attempt;
      }
      await this.db.videos.bulkPut(videos);
      if (videos.length > 0) sync.lastMirrorChangeRevision = revision;
      await this.db.sync.put(sync, SINGLETON_KEY);
    });
  }

  // Claim within one transaction. A simultaneous loser observes the durable
  // winner, including when another service instance owns the running task.
  async claimSyncAttempt(value: Pick<SyncAttempt, 'attemptId' | 'requestId' | 'workerInstanceId'>,
    time: RepositoryTime): Promise<{ status: 'started' | 'already-active'; snapshot: LibrarySnapshot }> {
    parse(z.strictObject({ attemptId: attemptSchema.shape.attemptId, requestId: attemptSchema.shape.requestId,
      workerInstanceId: attemptSchema.shape.workerInstanceId }), value, 'invalid-input');
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const snapshot = await this.state();
      const now = transactionTime(time);
      this.assertEligible(snapshot, now);
      if (snapshot.control.connectionGate !== 'connected') throw new StorageError('invalid-input');
      if (snapshot.sync?.currentAttempt && isActiveAttempt(snapshot.sync.currentAttempt.state)) {
        return { status: 'already-active', snapshot };
      }
      const sync = snapshot.sync ?? emptySync();
      sync.previousCompletedResult = sync.currentAttempt;
      sync.currentAttempt = parse(attemptSchema, { ...value, ownerChannelId: snapshot.owner?.channelId ?? null,
        dataGeneration: snapshot.control.dataGeneration, authEpoch: snapshot.control.authEpoch,
        state: 'preparing', startedAt: now, updatedAt: now, finishedAt: null,
        pagesAccepted: 0, rawItems: 0, uniqueMembership: 0, safeCommits: 0, addedCount: 0, updatedCount: 0,
        retrying: false, estimatedTotal: null, error: null, completionEvidence: null,
        freshness: derivedFreshness(now, retainedFreshness(snapshot.owner, snapshot.videos, snapshot.sync)) }, 'invalid-input');
      await this.db.sync.put(sync, SINGLETON_KEY);
      await this.db.control.put({ ...snapshot.control, revision: increment(snapshot.control.revision),
        lastClockSeenAt: now }, SINGLETON_KEY);
      return { status: 'started', snapshot: await this.state() };
    }));
  }

  private activeAttempt(snapshot: LibrarySnapshot): SyncAttempt {
    const attempt = snapshot.sync?.currentAttempt;
    if (!attempt || !isActiveAttempt(attempt.state)) throw new StorageError('attempt-mismatch');
    this.assertAttempt(attempt, snapshot);
    if (snapshot.control.connectionGate !== 'connected') throw new StorageError('stale-write');
    return attempt;
  }

  private assertVerifiedOwner(verification: unknown, snapshot: LibrarySnapshot): asserts verification is VerifiedSyncOwner {
    if (!isVerifiedSyncOwner(verification)) throw new StorageError('invalid-input');
    const attempt = this.activeAttempt(snapshot);
    if (verification.scope.attemptId !== attempt.attemptId) throw new StorageError('attempt-mismatch');
    if (verification.scope.dataGeneration !== attempt.dataGeneration || verification.scope.authEpoch !== attempt.authEpoch) {
      throw new StorageError('stale-write');
    }
    if (snapshot.owner && (verification.owner.channelId !== snapshot.owner.channelId
      || verification.owner.likesPlaylistId !== snapshot.owner.likesPlaylistId)) throw new StorageError('owner-mismatch');
  }

  async bindSyncOwner(verification: VerifiedSyncOwner, expected: WriteFence, time: RepositoryTime): Promise<LibrarySnapshot> {
    return this.mutate(expected, time, async (snapshot, _revision, now) => {
      this.assertVerifiedOwner(verification, snapshot);
      const attempt = this.activeAttempt(snapshot);
      if (attempt.state !== 'preparing' || verification.checkNumber !== 1 || verification.observedAt > now) throw new StorageError('invalid-input');
      await this.db.owner.put(parse(ownerSchema, { channelId: verification.owner.channelId,
        likesPlaylistId: verification.owner.likesPlaylistId, displayName: verification.owner.channelTitle ?? null,
        verifiedAt: verification.observedAt,
        freshness: derivedFreshness(verification.observedAt, []) }, 'invalid-input'), SINGLETON_KEY);
      snapshot.sync!.currentAttempt = { ...attempt, ownerChannelId: verification.owner.channelId, updatedAt: now };
      await this.db.sync.put(snapshot.sync!, SINGLETON_KEY);
    });
  }

  async transitionSyncAttempt(state: 'scanning' | 'applying' | 'finalizing', expected: WriteFence,
    time: RepositoryTime): Promise<LibrarySnapshot> {
    return this.mutate(expected, time, async (snapshot, _revision, now) => {
      const attempt = this.activeAttempt(snapshot);
      if (!canTransition(attempt.state, state)) throw new StorageError('invalid-input');
      snapshot.sync!.currentAttempt = parse(attemptSchema, { ...attempt, state, updatedAt: now }, 'invalid-input');
      await this.db.sync.put(snapshot.sync!, SINGLETON_KEY);
    });
  }

  async applyProviderPage(value: ProviderPage, expected: WriteFence, time: RepositoryTime): Promise<LibrarySnapshot> {
    const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
    const page = parse(z.strictObject({ kind: z.literal('page'), pageNumber: count, terminal: z.boolean(),
      records: z.array(videoSchema), progress: z.strictObject({ pagesAccepted: count, rawItems: count,
        uniqueMembership: count, duplicateVideoItems: count, estimatedTotal: count.nullable() }) }), value, 'invalid-input');
    return this.mutate(expected, time, async (snapshot, revision, now) => {
      const attempt = this.activeAttempt(snapshot);
      if (attempt.state !== 'applying' || page.pageNumber !== attempt.pagesAccepted + 1
        || page.progress.pagesAccepted !== page.pageNumber || page.progress.rawItems < attempt.rawItems
        || page.progress.uniqueMembership < attempt.uniqueMembership
        || page.progress.duplicateVideoItems !== page.progress.rawItems - page.progress.uniqueMembership
        || new Set(page.records.map((record) => record.videoId)).size !== page.records.length) {
        throw new StorageError('invalid-input');
      }
      const existing = new Map(snapshot.videos.map((record) => [record.videoId, record]));
      let addedCount = attempt.addedCount;
      let updatedCount = attempt.updatedCount;
      const records = page.records.map((incoming) => {
        if (incoming.ownerChannelId !== snapshot.owner?.channelId) throw new StorageError('owner-mismatch');
        if (incoming.lastSeenAttemptId !== attempt.attemptId) throw new StorageError('attempt-mismatch');
        const previous = existing.get(incoming.videoId);
        if (!previous) addedCount++;
        else if (previous.lastSeenAttemptId !== attempt.attemptId) updatedCount++;
        return mergeObservedVideo(previous, incoming);
      });
      const seen = new Set(snapshot.videos.filter((record) => record.lastSeenAttemptId === attempt.attemptId).map((record) => record.videoId));
      for (const record of records) seen.add(record.videoId);
      if (seen.size !== page.progress.uniqueMembership) throw new StorageError('invalid-input');
      const checkpoint = parse(attemptSchema, { ...attempt, pagesAccepted: page.progress.pagesAccepted,
        rawItems: page.progress.rawItems, uniqueMembership: page.progress.uniqueMembership,
        estimatedTotal: page.progress.estimatedTotal, safeCommits: attempt.safeCommits + 1,
        addedCount, updatedCount, updatedAt: now }, 'invalid-input');
      await this.db.videos.bulkPut(records);
      snapshot.sync!.currentAttempt = checkpoint;
      if (records.length > 0) snapshot.sync!.lastMirrorChangeRevision = revision;
      await this.db.sync.put(snapshot.sync!, SINGLETON_KEY);
    });
  }

  async finishSyncAttempt(error: DomainError, expected: WriteFence, time: RepositoryTime): Promise<LibrarySnapshot> {
    return this.mutate(expected, time, async (snapshot, _revision, now) => {
      const attempt = this.activeAttempt(snapshot);
      const state = attemptOutcome(attempt, error);
      if (!canTransition(attempt.state, state)) throw new StorageError('invalid-input');
      snapshot.sync!.currentAttempt = parse(attemptSchema, { ...attempt, state,
        updatedAt: now, finishedAt: now, retrying: false, error, completionEvidence: null }, 'invalid-input');
      await this.db.sync.put(snapshot.sync!, SINGLETON_KEY);
    });
  }

  // The sole membership-pruning transaction. Reject provenance before reading
  // the database; summaries, booleans and JSON can never enter this boundary.
  async finalizeTrustedEnumeration(proof: unknown, expected: WriteFence, time: RepositoryTime,
    finalOwner?: VerifiedSyncOwner): Promise<LibrarySnapshot> {
    if (!isTrustedProviderCompletion(proof)) throw new StorageError('invalid-input');
    return this.mutate(expected, time, async (snapshot, revision, now) => {
      this.assertVerifiedOwner(finalOwner, snapshot);
      const attempt = this.activeAttempt(snapshot);
      if (attempt.state !== 'finalizing') throw new StorageError('attempt-mismatch');
      if (proof.scope.attemptId !== attempt.attemptId) throw new StorageError('attempt-mismatch');
      if (proof.scope.dataGeneration !== attempt.dataGeneration || proof.scope.authEpoch !== attempt.authEpoch) {
        throw new StorageError('stale-write');
      }
      if (proof.scope.ownerChannelId !== snapshot.owner?.channelId || proof.scope.likesPlaylistId !== snapshot.owner.likesPlaylistId) {
        throw new StorageError('owner-mismatch');
      }
      if (finalOwner.checkNumber < 2 || finalOwner.observedAt < proof.terminalPageObservedAt || finalOwner.observedAt > now
        || attempt.pagesAccepted !== proof.progress.pagesAccepted || attempt.safeCommits !== attempt.pagesAccepted
        || attempt.rawItems !== proof.progress.rawItems || attempt.uniqueMembership !== proof.progress.uniqueMembership) {
        throw new StorageError('invalid-input');
      }
      const seen = new Set(proof.membershipVideoIds);
      const committed = snapshot.videos.filter((record) => record.lastSeenAttemptId === attempt.attemptId);
      if (committed.length !== seen.size || committed.some((record) => !seen.has(record.videoId))) {
        throw new StorageError('invalid-input');
      }
      const remaining = snapshot.videos.filter((record) => seen.has(record.videoId));
      const removed = snapshot.videos.filter((record) => !seen.has(record.videoId));
      const owner = parse(ownerSchema, { channelId: finalOwner.owner.channelId,
        likesPlaylistId: finalOwner.owner.likesPlaylistId, displayName: finalOwner.owner.channelTitle ?? null,
        verifiedAt: finalOwner.observedAt, freshness: derivedFreshness(finalOwner.observedAt, []) }, 'invalid-input');
      const freshness = derivedFreshness(proof.terminalPageObservedAt, retainedFreshness(owner, remaining, null));
      const success = parse(latestSuccessSchema, { attemptId: attempt.attemptId, ownerChannelId: owner.channelId,
        dataGeneration: attempt.dataGeneration, startedAt: attempt.startedAt, completedAt: now,
        pageCount: proof.progress.pagesAccepted, rawRemoteCount: proof.progress.rawItems,
        uniqueRemoteCount: proof.progress.uniqueMembership, localMembershipCount: remaining.length,
        localAvailableCount: remaining.filter((record) => record.availability.state === 'available').length,
        addedCount: attempt.addedCount, updatedCount: attempt.updatedCount, removedCount: removed.length,
        freshness }, 'invalid-input');
      const sync = snapshot.sync!;
      sync.currentAttempt = parse(attemptSchema, { ...attempt, state: 'success', updatedAt: now, finishedAt: now,
        retrying: false, error: null, freshness, completionEvidence: { validatorRevision: proof.validatorRevision,
          acceptedPages: proof.progress.pagesAccepted, rawItems: proof.progress.rawItems,
          uniqueMembership: proof.progress.uniqueMembership, terminalPageObservedAt: proof.terminalPageObservedAt } }, 'invalid-input');
      sync.latestSuccessfulSync = success;
      sync.lastMirrorChangeRevision = revision;
      sync.lastFinalizedMirrorRevision = revision;
      await this.db.videos.bulkDelete(removed.map((record) => record.videoId));
      await this.db.owner.put(owner, SINGLETON_KEY);
      await this.db.sync.put(sync, SINGLETON_KEY);
    });
  }

  async recoverSyncInterruption(workerInstanceId: string, time: RepositoryTime): Promise<LibrarySnapshot> {
    parse(z.uuid(), workerInstanceId, 'invalid-input');
    await this.enforceRetention(time);
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const snapshot = await this.state();
      const now = transactionTime(time);
      this.assertEligible(snapshot, now);
      const attempt = snapshot.sync?.currentAttempt;
      if (!attempt || !isActiveAttempt(attempt.state) || attempt.workerInstanceId === workerInstanceId) return snapshot;
      snapshot.sync!.currentAttempt = parse(attemptSchema, { ...attempt, state: 'interrupted',
        updatedAt: now, finishedAt: now, retrying: false,
        error: { category: 'interrupted', messageKey: 'worker-interrupted', phase: attempt.state },
        completionEvidence: null }, 'invalid-input');
      await this.db.sync.put(snapshot.sync!, SINGLETON_KEY);
      await this.db.control.put({ ...snapshot.control, revision: increment(snapshot.control.revision), lastClockSeenAt: now }, SINGLETON_KEY);
      return this.state();
    }));
  }

  async clearLocalData(expected: ControlFence): Promise<ControlState> {
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const control = await this.control();
      assertControlFence(control, expected);
      if (control.pendingCleanupReason !== null) throw new StorageError('cleanup-pending');
      await this.db.owner.clear();
      await this.db.videos.clear();
      await this.db.sync.clear();
      const next: ControlState = { ...control, dataGeneration: increment(control.dataGeneration),
        revision: increment(control.revision), lastCleanupReason: 'clear', deletionStatus: 'succeeded' };
      await this.db.control.put(next, SINGLETON_KEY);
      return next;
    }));
  }

  // Intent commits separately so deletion failure cannot reopen the data gate.
  async beginCleanup(reason: CleanupReason, expected: ControlFence): Promise<ControlState> {
    const validReason = parse(cleanupReasonSchema, reason, 'invalid-input');
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const control = await this.control();
      assertControlFence(control, expected);
      // Explicit Disconnect may supersede an already pending policy cleanup;
      // it must still close authorization and record its own remote outcomes.
      if (control.pendingCleanupReason !== null && validReason !== 'disconnect') throw new StorageError('cleanup-pending');
      const closeAuthorization = validReason !== 'expiry';
      const next: ControlState = {
        ...control, dataGeneration: increment(control.dataGeneration), revision: increment(control.revision),
        authEpoch: closeAuthorization ? increment(control.authEpoch) : control.authEpoch,
        connectionGate: closeAuthorization ? 'disconnected' : control.connectionGate,
        authorizationCheckDueAt: closeAuthorization ? null : control.authorizationCheckDueAt,
        pendingCleanupReason: validReason, deletionStatus: 'pending',
        revocationStatus: validReason === 'disconnect' ? 'pending' : control.revocationStatus,
        cacheInvalidationStatus: closeAuthorization ? 'pending' : control.cacheInvalidationStatus,
      };
      await this.db.control.put(next, SINGLETON_KEY);
      return next;
    }));
  }

  async finishCleanup(expected: ControlFence): Promise<ControlState> {
    try {
      return await this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
        const control = await this.control();
        assertControlFence(control, expected);
        if (control.pendingCleanupReason === null) throw new StorageError('invalid-input');
        await this.db.owner.clear();
        await this.db.videos.clear();
        await this.db.sync.clear();
        const next: ControlState = { ...control, revision: increment(control.revision),
          lastCleanupReason: control.pendingCleanupReason, pendingCleanupReason: null, deletionStatus: 'succeeded' };
        await this.db.control.put(next, SINGLETON_KEY);
        return next;
      }));
    } catch (error) {
      if (error instanceof StorageError && error.code === 'persistence') {
        await this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
          const control = await this.control();
          assertControlFence(control, expected);
          if (control.pendingCleanupReason !== null) {
            await this.db.control.put({ ...control, revision: increment(control.revision),
              deletionStatus: 'failed' }, SINGLETON_KEY);
          }
        }));
      }
      throw error;
    }
  }

  // Explicit pure-local expiry/recovery primitive. No scheduler or network refresh.
  async enforceRetention(time: RepositoryTime): Promise<'unchanged' | 'deleted'> {
    transactionTime(time);
    const control = await this.readControl();
    if (control.pendingCleanupReason !== null) {
      await this.finishCleanup(control);
      return 'deleted';
    }
    try {
      await this.readSnapshot(time);
      return 'unchanged';
    } catch (error) {
      if (!(error instanceof StorageError) || !['expired', 'invalid-data'].includes(error.code)) throw error;
      const pending = await this.beginCleanup('expiry', control);
      await this.finishCleanup(pending);
      return 'deleted';
    }
  }
}
