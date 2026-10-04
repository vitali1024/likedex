import type { ControlState, CleanupReason } from '../domain/contracts';
import { StorageError, type LibraryRepository, type ControlFence } from '../storage/repository';
import { compareOwner, type AuthenticatedYouTubeBootstrap, type OwnerComparison } from '../domain/authentication';
import { AuthenticationError, assertNotAborted, sanitizedFailure } from './errors';
import { isVerifiedSyncOwner, type VerifiedSyncOwner, type GoogleAuthorizationRequests, type RevocationOutcome } from './google-requests';

type AuthRepository = Pick<LibraryRepository, 'readControl' | 'readSnapshot' | 'enforceRetention'
  | 'saveConnectionState' | 'recordAuthorizationCheck' | 'beginCleanup' | 'finishCleanup' | 'recordAuthenticationTeardown'>;
type AuthRequests = Pick<GoogleAuthorizationRequests, 'bootstrapSilently' | 'connectExplicitly'
  | 'revokeAuthorization' | 'clearCachedAuthorization'>;
export type BootstrapResult = {
  status: 'authorized'; bootstrap: AuthenticatedYouTubeBootstrap;
  ownerComparison: Exclude<OwnerComparison, 'DIFFERENT_REMOTE_OWNER'>;
} | {
  status: 'owner-mismatch'; bootstrap: AuthenticatedYouTubeBootstrap;
  localOwnerChannelId: string; error: AuthenticationError;
};
export interface DisconnectResult extends RevocationOutcome {
  completed: boolean;
  fencing: 'succeeded' | 'failed';
  deletion: 'succeeded' | 'failed';
  statusPersistence: 'succeeded' | 'failed';
}
export interface AuthorizationCleanupResult {
  deletion: 'succeeded' | 'failed'; cacheInvalidation: 'succeeded' | 'failed';
  persistence: 'succeeded' | 'failed';
}
export class AuthorizationCheckFailure extends AuthenticationError {
  constructor(failure: AuthenticationError, readonly cleanup: AuthorizationCleanupResult) { super(failure.code); }
}

// Construct explicitly in the future background composition. No startup,
// scheduling, runtime messages or UI behavior lives in this service.
export class AuthenticationService {
  private activeCheck: AbortController | null = null;
  private disconnecting = false;
  private blocked = false;
  private validated: { authEpoch: number; dataGeneration: number; result: BootstrapResult } | null = null;
  constructor(private readonly repository: AuthRepository, private readonly requests: AuthRequests,
    private readonly now: () => string = () => new Date().toISOString()) {}

  private async safe<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) { throw error instanceof StorageError ? new AuthenticationError('storage') : sanitizedFailure(error); }
  }
  private dueAt(now: string): string { return new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(); }
  private sameContext(a: Pick<ControlFence, 'authEpoch' | 'dataGeneration'>,
    b: Pick<ControlFence, 'authEpoch' | 'dataGeneration'>): boolean {
    return a.authEpoch === b.authEpoch && a.dataGeneration === b.dataGeneration;
  }

  // Recovery retries deletion without retaining/recreating a token. Interrupted
  // revocation is unconfirmed; it can only be retried by explicit Disconnect.
  async recoverCleanup(): Promise<ControlState> {
    return this.safe(async () => {
      if (this.disconnecting || this.activeCheck !== null) throw new AuthenticationError('busy');
      let retentionFailure: unknown;
      try { await this.repository.enforceRetention(this.now()); }
      catch (error) { retentionFailure = error; }
      if (this.disconnecting) throw new AuthenticationError('busy');
      let control = await this.repository.readControl();
      if (control.connectionGate === 'disconnected'
        && (control.revocationStatus === 'pending' || ['pending', 'failed'].includes(control.cacheInvalidationStatus))) {
        let cacheInvalidationStatus = control.cacheInvalidationStatus;
        try { await this.requests.clearCachedAuthorization(); cacheInvalidationStatus = 'succeeded'; }
        catch { cacheInvalidationStatus = 'failed'; }
        control = await this.repository.recordAuthenticationTeardown({ cacheInvalidationStatus,
          revocationStatus: control.revocationStatus === 'pending' ? 'unconfirmed' : control.revocationStatus }, control);
        if (cacheInvalidationStatus === 'failed') throw new AuthenticationError('cache-invalidation-failed');
      }
      if (retentionFailure !== undefined) throw retentionFailure;
      return control;
    });
  }

  async inspectAuthenticationState(): Promise<{ status: 'auth-required' } | BootstrapResult> {
    return this.safe(async () => {
      if (this.blocked) throw new AuthenticationError('storage');
      const control = await this.recoverCleanup();
      if (control.connectionGate !== 'connected') return { status: 'auth-required' };
      const now = this.now();
      if (this.validated !== null && this.sameContext(this.validated, control)
        && control.authorizationCheckDueAt !== null && now < control.authorizationCheckDueAt) return this.validated.result;
      return this.validateAuthorization();
    });
  }

  // Explicit operation intended only after informed user intent in later UI.
  connectInteractively(): Promise<BootstrapResult> { return this.check(true); }
  // Required new-session/periodic check. Its caller owns lifecycle invocation.
  validateAuthorization(): Promise<BootstrapResult> { return this.check(false); }

  // Reuse the actual sync session check in this worker without another network
  // check racing page transactions. Durable scope/deadline is checked on use.
  acceptSyncAuthorization(receipt: VerifiedSyncOwner): void {
    if (!isVerifiedSyncOwner(receipt)) throw new AuthenticationError('unexpected');
    this.validated = { ...receipt.scope, result: { status: 'authorized', bootstrap: receipt.owner,
      ownerComparison: 'SAME_REMOTE_OWNER' } };
  }

  // Sync's shared request session already exhausted the approved recovery
  // budget. Apply existing teardown policy without another authorization call.
  async cleanupSyncAuthorization(failure: AuthenticationError,
    expected: Pick<ControlFence, 'dataGeneration' | 'authEpoch'>): Promise<AuthorizationCleanupResult> {
    this.validated = null;
    const control = await this.repository.readControl();
    if (!this.sameContext(expected, control)) throw new AuthenticationError('cancelled');
    const reason = ['auth-required', 'permission-denied'].includes(failure.code)
      ? 'authorization-invalid' : 'authorization-unverified';
    return this.cleanupAuthorization(reason, control);
  }

  private async check(interactive: boolean): Promise<BootstrapResult> {
    return this.safe(async () => {
      if (this.blocked) throw new AuthenticationError('storage');
      if (this.disconnecting || this.activeCheck !== null) throw new AuthenticationError('busy');
      await this.recoverCleanup();
      // Reserve before the first remote await so Disconnect remains serviceable.
      if (this.disconnecting || this.activeCheck !== null) throw new AuthenticationError('busy');
      const controller = new AbortController();
      this.activeCheck = controller;
      this.validated = null;
      try {
        const before = await this.repository.readSnapshot(this.now());
        assertNotAborted(controller.signal);
        if (!interactive && before.control.connectionGate !== 'connected') throw new AuthenticationError('auth-required');
        let bootstrap: AuthenticatedYouTubeBootstrap;
        try {
          bootstrap = await (interactive ? this.requests.connectExplicitly(controller.signal)
            : this.requests.bootstrapSilently(controller.signal));
        } catch (error) {
          const failure = sanitizedFailure(error);
          if (controller.signal.aborted) throw new AuthenticationError('cancelled');
          // Cancelled/denied new Connect is not loss of an existing grant.
          if (!interactive || failure.code === 'auth-required') {
            const reason = ['auth-required', 'permission-denied'].includes(failure.code)
              ? 'authorization-invalid' : 'authorization-unverified';
            throw new AuthorizationCheckFailure(failure, await this.cleanupAuthorization(reason, before.control));
          }
          throw failure;
        }
        assertNotAborted(controller.signal);
        const after = await this.repository.readSnapshot(this.now());
        if (!this.sameContext(before.control, after.control)) throw new AuthenticationError('cancelled');
        const comparison = compareOwner(after.owner, bootstrap);
        if (comparison === 'DIFFERENT_REMOTE_OWNER') {
          this.validated = null;
          if (after.owner === null) throw new AuthenticationError('unexpected');
          return { status: 'owner-mismatch', bootstrap, localOwnerChannelId: after.owner.channelId,
            error: new AuthenticationError('owner-mismatch') };
        }
        const now = this.now();
        const control = interactive
          ? (await this.repository.saveConnectionState({ connectionGate: 'connected', authorizationCheckDueAt: this.dueAt(now) },
            after.fence, now)).control
          : await this.repository.recordAuthorizationCheck(this.dueAt(now), after.control, now);
        assertNotAborted(controller.signal);
        // Candidate only. Sync's authoritative owner-binding transaction is later.
        const result: BootstrapResult = { status: 'authorized', bootstrap, ownerComparison: comparison };
        this.validated = { authEpoch: control.authEpoch, dataGeneration: control.dataGeneration, result };
        return result;
      } finally { this.activeCheck = null; }
    });
  }

  private async cleanupAuthorization(reason: CleanupReason, expected: ControlFence): Promise<AuthorizationCleanupResult> {
    this.validated = null;
    const result: AuthorizationCleanupResult = { deletion: 'failed', cacheInvalidation: 'failed', persistence: 'succeeded' };
    let pending: ControlState | null = null;
    try {
      const current = await this.repository.readControl();
      if (!this.sameContext(current, expected)) throw new AuthenticationError('cancelled');
      pending = await this.repository.beginCleanup(reason, current);
    }
    catch { this.blocked = true; result.persistence = 'failed'; }
    if (pending !== null) {
      try { await this.repository.finishCleanup(pending); result.deletion = 'succeeded'; }
      catch { result.deletion = 'failed'; }
    }
    try { await this.requests.clearCachedAuthorization(); result.cacheInvalidation = 'succeeded'; }
    catch { result.cacheInvalidation = 'failed'; }
    if (pending !== null) {
      try {
        const current = await this.repository.readControl();
        if (!this.sameContext(pending, current)) throw new AuthenticationError('cancelled');
        await this.repository.recordAuthenticationTeardown({ revocationStatus: current.revocationStatus,
          cacheInvalidationStatus: result.cacheInvalidation }, current);
      } catch { result.persistence = 'failed'; }
    }
    return result;
  }

  async disconnect(): Promise<DisconnectResult> {
    if (this.disconnecting) throw new AuthenticationError('busy');
    this.disconnecting = true;
    this.blocked = true;
    this.validated = null;
    this.activeCheck?.abort();
    try {
      let pending: ControlState | null = null;
      let fencing: DisconnectResult['fencing'] = 'succeeded';
      try {
        const control = await this.repository.readControl();
        pending = await this.repository.beginCleanup('disconnect', control);
      } catch { fencing = 'failed'; }
      // Start deletion before any remote revoke await. Either operation may fail
      // independently. The transaction is wholly local; no network await in it.
      const deletionPromise = pending === null ? Promise.resolve('failed' as const)
        : this.repository.finishCleanup(pending).then(() => 'succeeded' as const, () => 'failed' as const);
      const remote = await this.requests.revokeAuthorization();
      const deletion = await deletionPromise;
      let statusPersistence: DisconnectResult['statusPersistence'] = fencing;
      if (pending !== null) {
        try {
          const current = await this.repository.readControl();
          if (!this.sameContext(pending, current)) throw new AuthenticationError('cancelled');
          await this.repository.recordAuthenticationTeardown({ revocationStatus: remote.revocation,
            cacheInvalidationStatus: remote.cacheInvalidation }, current);
        } catch { statusPersistence = 'failed'; }
      }
      this.blocked = fencing === 'failed' || statusPersistence === 'failed';
      return { ...remote, fencing, deletion, statusPersistence,
        completed: fencing === 'succeeded' && deletion === 'succeeded' && statusPersistence === 'succeeded'
          && remote.revocation === 'succeeded' && remote.cacheInvalidation === 'succeeded' };
    } finally { this.disconnecting = false; }
  }
}
