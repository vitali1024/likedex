import { z } from 'zod';
import {
  attemptSchema, cleanupReasonSchema, controlSchema, fenceSchema, instantSchema, isActiveAttempt, latestSuccessSchema,
  ownerSchema, retainedFreshness, syncSchema, videoSchema,
  type CleanupReason, type ControlState, type LatestSuccessfulSync, type LibrarySnapshot,
  type MirroredVideo, type RemoteOwner, type SyncAttempt, type SyncMetadata, type WriteFence,
} from '../domain/contracts';
import { LikedexDatabase, SINGLETON_KEY } from './database';

export type StorageErrorCode = 'persistence' | 'invalid-input' | 'invalid-data' | 'stale-write'
  | 'owner-mismatch' | 'attempt-mismatch' | 'cleanup-pending' | 'expired' | 'clock-unverified';
export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    // Deliberately do not attach database records or raw driver exceptions.
    super(`Likedex storage: ${code}`);
    this.name = 'StorageError';
  }
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
  constructor(private readonly db: LikedexDatabase) {}

  private async operation<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); }
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

  // Local freshness/cleanup validation only. The future coordinator MUST also
  // validate authorization before exposing this snapshot to UI or Export.
  async readSnapshot(now: string): Promise<LibrarySnapshot> {
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const snapshot = await this.state();
      this.assertEligible(snapshot, now);
      snapshot.control.lastClockSeenAt = now;
      await this.db.control.put(snapshot.control, SINGLETON_KEY);
      return snapshot;
    }));
  }

  private async mutate(expected: WriteFence, now: string,
    write: (snapshot: LibrarySnapshot, nextRevision: number) => Promise<void>): Promise<LibrarySnapshot> {
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const before = await this.state();
      this.assertEligible(before, now);
      this.assertFence(before, expected);
      const revision = increment(before.control.revision);
      await write(before, revision);
      await this.db.control.put({ ...before.control, revision, lastClockSeenAt: now }, SINGLETON_KEY);
      const after = await this.state();
      this.assertEligible(after, now);
      return after;
    }));
  }

  async saveOwner(value: RemoteOwner, expected: WriteFence, now: string): Promise<LibrarySnapshot> {
    const owner = parse(ownerSchema, value, 'invalid-input');
    return this.mutate(expected, now, async (snapshot) => {
      if (snapshot.owner !== null && snapshot.owner.channelId !== owner.channelId) {
        throw new StorageError('owner-mismatch');
      }
      await this.db.owner.put(owner, SINGLETON_KEY);
    });
  }

  // Pure persistence of a future auth adapter's result; no token/API behavior.
  async saveConnectionState(value: Pick<ControlState, 'connectionGate' | 'authorizationCheckDueAt'>,
    expected: WriteFence, now: string): Promise<LibrarySnapshot> {
    const connection = parse(z.strictObject({ connectionGate: controlSchema.shape.connectionGate,
      authorizationCheckDueAt: controlSchema.shape.authorizationCheckDueAt }), value, 'invalid-input');
    return this.mutate(expected, now, async (snapshot) => {
      snapshot.control.connectionGate = connection.connectionGate;
      snapshot.control.authorizationCheckDueAt = connection.authorizationCheckDueAt;
      snapshot.control.authEpoch = increment(snapshot.control.authEpoch);
    });
  }

  // Successful periodic checks do not change auth epoch or refresh API facts.
  async recordAuthorizationCheck(dueAt: string, expected: ControlFence, now: string): Promise<ControlState> {
    parse(instantSchema, dueAt, 'invalid-input');
    parse(instantSchema, now, 'invalid-input');
    if (dueAt <= now || Date.parse(dueAt) - Date.parse(now) > 24 * 60 * 60 * 1000) throw new StorageError('invalid-input');
    return this.operation(() => this.db.transaction('rw', this.db.tables, async () => {
      const snapshot = await this.state();
      this.assertEligible(snapshot, now);
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

  async saveCurrentAttempt(value: SyncAttempt, expected: WriteFence, now: string): Promise<LibrarySnapshot> {
    const attempt = parse(attemptSchema, value, 'invalid-input');
    return this.mutate(expected, now, async (snapshot) => {
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
  async saveLatestSuccessfulSync(value: LatestSuccessfulSync, expected: WriteFence, now: string): Promise<LibrarySnapshot> {
    const success = parse(latestSuccessSchema, value, 'invalid-input');
    return this.mutate(expected, now, async (snapshot) => {
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
  async upsertVideos(values: MirroredVideo[], expected: WriteFence, now: string,
    checkpoint?: SyncAttempt): Promise<LibrarySnapshot> {
    const videos = parse(z.array(videoSchema), values, 'invalid-input');
    const attempt = checkpoint === undefined ? undefined : parse(attemptSchema, checkpoint, 'invalid-input');
    if (new Set(videos.map((video) => video.videoId)).size !== videos.length) throw new StorageError('invalid-input');
    return this.mutate(expected, now, async (snapshot, revision) => {
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
  async enforceRetention(now: string): Promise<'unchanged' | 'deleted'> {
    parse(instantSchema, now, 'invalid-input');
    const control = await this.readControl();
    if (control.pendingCleanupReason !== null) {
      await this.finishCleanup(control);
      return 'deleted';
    }
    try {
      await this.readSnapshot(now);
      return 'unchanged';
    } catch (error) {
      if (!(error instanceof StorageError) || !['expired', 'invalid-data'].includes(error.code)) throw error;
      const pending = await this.beginCleanup('expiry', control);
      await this.finishCleanup(pending);
      return 'deleted';
    }
  }
}
