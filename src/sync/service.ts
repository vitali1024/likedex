import { z } from 'zod';
import type { GoogleAuthorizationRequests, VerifiedSyncOwner, YouTubeSyncSession } from '../auth/google-requests';
import { AuthenticationError } from '../auth/errors';
import { AuthenticationService, type AuthorizationCleanupResult } from '../auth/service';
import { isActiveAttempt, type DomainError, type LibrarySnapshot, type SyncAttempt } from '../domain/contracts';
import { ProviderError } from '../provider/errors';
import { YouTubeLikedVideosProvider, type TrustedProviderCompletion } from '../provider/youtube-ingestion';
import { LibraryRepository, StorageError } from '../storage/repository';

export interface SyncRunResult {
  status: 'success' | 'failure' | 'partial' | 'interrupted' | 'superseded' | 'status-unsaved' | 'cleanup';
  attemptId: string;
  error: DomainError | null;
  cleanup?: AuthorizationCleanupResult;
}
export interface SyncLaunch {
  status: 'started' | 'already-active';
  attempt: SyncAttempt;
  // Null means another service/worker owns the durable attempt. Observe storage;
  // do not launch a second task or pretend an in-memory promise was recovered.
  completion: Promise<SyncRunResult> | null;
}
export function syncError(error: unknown, phase: SyncAttempt['state']): DomainError {
  if (error instanceof AuthenticationError || error instanceof ProviderError) return { ...error.detail, phase };
  if (error instanceof StorageError) {
    if (error.code === 'owner-mismatch') return { category: 'owner-mismatch', messageKey: 'owner-mismatch', phase };
    if (['stale-write', 'attempt-mismatch', 'cleanup-pending', 'expired'].includes(error.code)) {
      return { category: 'interrupted', messageKey: 'worker-interrupted', phase };
    }
    return { category: 'persistence', messageKey: 'storage-failed', phase };
  }
  return { category: 'internal', messageKey: 'unexpected-error', phase };
}

export class SynchronizationService {
  private readonly tasks = new Map<string, { abort: AbortController; completion: Promise<SyncRunResult> }>();
  private readonly provider: YouTubeLikedVideosProvider;
  private readonly auth: AuthenticationService;
  constructor(private readonly repository: LibraryRepository, private readonly requests: GoogleAuthorizationRequests,
    private readonly workerInstanceId: string, private readonly now: () => string = () => new Date().toISOString(),
    private readonly nextId: () => string = () => crypto.randomUUID(),
    private readonly authorizationValidated: (receipt: VerifiedSyncOwner) => void = () => {}) {
    z.uuid().parse(workerInstanceId);
    this.provider = new YouTubeLikedVideosProvider(requests);
    this.auth = new AuthenticationService(repository, requests, now);
  }

  async start(requestId: string): Promise<SyncLaunch> {
    z.uuid().parse(requestId);
    await this.repository.enforceRetention(() => this.now());
    if ((await this.repository.readControl()).connectionGate !== 'connected') throw new AuthenticationError('auth-required');
    const claim = await this.repository.claimSyncAttempt({ requestId, workerInstanceId: this.workerInstanceId,
      attemptId: this.nextId() }, this.now);
    const attempt = claim.snapshot.sync!.currentAttempt!;
    if (claim.status === 'already-active') {
      return { status: 'already-active', attempt, completion: this.tasks.get(attempt.attemptId)?.completion ?? null };
    }
    const abort = new AbortController();
    const completion = this.run(claim.snapshot, abort.signal);
    this.tasks.set(attempt.attemptId, { abort, completion });
    void completion.then(() => this.tasks.delete(attempt.attemptId));
    return { status: 'started', attempt, completion };
  }

  // Cancellation is an explicit service operation; worker-loss recovery reads
  // persisted state separately. Clear/Disconnect additionally fence storage.
  cancel(attemptId: string): void { this.tasks.get(attemptId)?.abort.abort(); }
  recoverInterruption(): Promise<LibrarySnapshot> {
    return this.repository.recoverSyncInterruption(this.workerInstanceId, () => this.now());
  }
  observe(): Promise<LibrarySnapshot> { return this.repository.readSnapshot(() => this.now()); }

  private async current(initial: SyncAttempt): Promise<LibrarySnapshot> {
    const snapshot = await this.repository.readSnapshot(() => this.now());
    if (snapshot.control.dataGeneration !== initial.dataGeneration || snapshot.control.authEpoch !== initial.authEpoch
      || snapshot.sync?.currentAttempt?.attemptId !== initial.attemptId
      || !isActiveAttempt(snapshot.sync.currentAttempt.state)) throw new StorageError('stale-write');
    return snapshot;
  }

  private async run(initialSnapshot: LibrarySnapshot, signal: AbortSignal): Promise<SyncRunResult> {
    const initial = initialSnapshot.sync!.currentAttempt!;
    let snapshot = initialSnapshot;
    let phase: SyncAttempt['state'] = 'preparing';
    let checkingAuthorization = false;
    try {
      const session: YouTubeSyncSession = this.requests.createYouTubeSyncSession({ attemptId: initial.attemptId,
        dataGeneration: initial.dataGeneration, authEpoch: initial.authEpoch }, signal, initial.startedAt);
      const verify = async (): Promise<VerifiedSyncOwner> => {
        checkingAuthorization = true;
        const result = await session.verifyOwner();
        checkingAuthorization = false;
        return result;
      };
      const firstOwner = await verify();
      snapshot = await this.current(initial);
      snapshot = await this.repository.bindSyncOwner(firstOwner, snapshot.fence, this.now);
      await this.repository.recordAuthorizationCheck(new Date(Date.parse(this.now()) + 86_400_000).toISOString(),
        snapshot.control, this.now);
      this.authorizationValidated(firstOwner);
      snapshot = await this.current(initial);
      snapshot = await this.repository.transitionSyncAttempt('scanning', snapshot.fence, this.now);
      phase = 'scanning';
      let proof: TrustedProviderCompletion | null = null;
      for await (const event of this.provider.enumerateLikedVideos({ attemptId: initial.attemptId,
        dataGeneration: initial.dataGeneration, authEpoch: initial.authEpoch, owner: firstOwner.owner }, signal, session)) {
        snapshot = await this.current(initial);
        session.assertActive();
        if (event.kind === 'page') {
          snapshot = await this.repository.transitionSyncAttempt('applying', snapshot.fence, this.now);
          phase = 'applying';
          snapshot = await this.repository.applyProviderPage(event, snapshot.fence, this.now);
          // Terminal evidence arrives only after the last page has committed.
          // Stay applying until the stream tells us whether another page exists.
        } else {
          proof = event;
          snapshot = await this.repository.transitionSyncAttempt('finalizing', snapshot.fence, this.now);
          phase = 'finalizing';
        }
        if (event.kind === 'page' && !event.terminal) {
          // A continuation returns to scanning. A terminal page stays applying
          // until the provider issues its separate provenance-backed proof.
          snapshot = await this.repository.transitionSyncAttempt('scanning', snapshot.fence, this.now);
          phase = 'scanning';
        }
      }
      if (proof === null) throw new ProviderError('pagination-integrity');
      const finalOwner = await verify();
      snapshot = await this.current(initial);
      session.assertActive();
      await this.repository.finalizeTrustedEnumeration(proof, snapshot.fence, this.now, finalOwner);
      return { status: 'success', attemptId: initial.attemptId, error: null };
    } catch (error) {
      const detail = syncError(error, phase);
      // A required owner/auth check that cannot complete is a distinct policy
      // deletion authority. Ordinary provider/network/quota failures preserve data.
      if (error instanceof AuthenticationError && !signal.aborted
        && (['auth-required', 'permission-denied'].includes(error.code)
          || (checkingAuthorization && !['owner-mismatch', 'cancelled'].includes(error.code)))) {
        try {
          const cleanup = await this.auth.cleanupSyncAuthorization(error, initial);
          return { status: 'cleanup', attemptId: initial.attemptId, error: detail, cleanup };
        } catch (cleanupError) {
          return { status: cleanupError instanceof AuthenticationError && cleanupError.code === 'cancelled' ? 'superseded' : 'status-unsaved',
            attemptId: initial.attemptId, error: syncError(cleanupError, phase) };
        }
      }
      if (error instanceof StorageError && ['stale-write', 'attempt-mismatch', 'cleanup-pending', 'expired'].includes(error.code)) {
        if (error.code === 'expired') {
          try { await this.repository.enforceRetention(() => this.now()); }
          catch { return { status: 'status-unsaved', attemptId: initial.attemptId, error: syncError(new StorageError('persistence'), phase) }; }
        }
        return { status: 'superseded', attemptId: initial.attemptId, error: detail };
      }
      try {
        snapshot = await this.current(initial);
        const terminal = await this.repository.finishSyncAttempt(detail, snapshot.fence, this.now);
        return { status: terminal.sync!.currentAttempt!.state as 'failure' | 'partial' | 'interrupted',
          attemptId: initial.attemptId, error: detail };
      } catch (saveError) {
        return { status: saveError instanceof StorageError && ['stale-write', 'attempt-mismatch', 'cleanup-pending'].includes(saveError.code)
          ? 'superseded' : 'status-unsaved', attemptId: initial.attemptId, error: syncError(saveError, phase) };
      }
    }
  }
}
