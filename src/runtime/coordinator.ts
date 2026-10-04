import { AuthenticationError } from '../auth/errors';
import { AuthenticationService, AuthorizationCheckFailure, type BootstrapResult } from '../auth/service';
import type { ControlState, LibrarySnapshot } from '../domain/contracts';
import { LibraryRepository, StorageError } from '../storage/repository';
import { SynchronizationService, type SyncRunResult } from '../sync/service';
import { authControlSchema, failure, requestSchema, resultSchemas, type RuntimeFailure, type RuntimeRequest, type RuntimeResponse } from './contracts';

export interface LifecycleScheduler { schedule(callback: () => void, delayMs: number): () => void }
const scheduler: LifecycleScheduler = { schedule: (callback, delay) => {
  const timer = setTimeout(callback, delay); return () => clearTimeout(timer);
} };
class RuntimeBoundaryError extends Error {
  constructor(readonly failure: RuntimeFailure) { super(failure.code); }
}
export class RuntimeCoordinator {
  private initialization: Promise<void> | null = null;
  private authorizationCheck: Promise<Awaited<ReturnType<AuthenticationService['inspectAuthenticationState']>>> | null = null;
  private readonly runs = new Map<string, Promise<SyncRunResult>>();
  private syncAuthorizationPending = false;
  private connecting = false;
  private authorizationContext: { dataGeneration: number; authEpoch: number } | null = null;
  private cancelTimer: (() => void) | null = null;
  private lifecycleFailure: unknown = null;
  private unsavedStatus = false;
  private stopped = false;

  constructor(private readonly repository: LibraryRepository, private readonly auth: AuthenticationService,
    private readonly sync: SynchronizationService, private readonly extensionId: string,
    private readonly options: { providerValidationApproved?: unknown; now?: () => string; scheduler?: LifecycleScheduler } = {}) {}
  private now(): string { return this.options.now?.() ?? new Date().toISOString(); }

  // Called only from the genuine sync owner-check observer after its persisted
  // authorization deadline. It enables observation, never pruning.
  authorizationValidated(context: { dataGeneration: number; authEpoch: number }): void {
    this.authorizationContext = context; this.syncAuthorizationPending = false;
  }
  private authorizationKnown(snapshot: LibrarySnapshot): boolean {
    return this.authorizationContext?.authEpoch === snapshot.control.authEpoch
      && this.authorizationContext.dataGeneration === snapshot.control.dataGeneration
      && snapshot.control.authorizationCheckDueAt !== null && this.now() < snapshot.control.authorizationCheckDueAt;
  }

  initialize(): Promise<void> {
    this.initialization ??= (async () => {
      await this.repository.initialize();
      await this.auth.recoverCleanup();
      const snapshot = await this.sync.recoverInterruption();
      this.arm(snapshot);
    })().catch((error: unknown) => { this.initialization = null; throw error; });
    return this.initialization;
  }

  private arm(snapshot: LibrarySnapshot): void {
    this.cancelTimer?.();
    if (this.stopped) return;
    const deadlines = [snapshot.earliestExpiresAt,
      snapshot.control.connectionGate === 'connected' ? snapshot.control.authorizationCheckDueAt : null]
      .filter((value): value is string => value !== null);
    if (!deadlines.length) { this.cancelTimer = null; return; }
    const delay = Math.min(2_147_483_647, Math.max(1, Date.parse(deadlines.sort()[0]!) - Date.parse(this.now())));
    this.cancelTimer = (this.options.scheduler ?? scheduler).schedule(() => {
      void this.enforceLifecycle().catch((error: unknown) => { this.lifecycleFailure = error; });
    }, delay);
  }

  // Timers are opportunistic; every data request repeats the barriers on wake.
  async enforceLifecycle(): Promise<void> {
    await this.initialize();
    await this.repository.enforceRetention(this.now());
    const control = await this.repository.readControl();
    if (control.connectionGate === 'connected' && (control.authorizationCheckDueAt === null
      || this.now() >= control.authorizationCheckDueAt)) {
      for (const id of this.runs.keys()) this.sync.cancel(id);
      await Promise.all(this.runs.values());
      await this.authorize();
    }
    this.lifecycleFailure = null;
    this.arm(await this.repository.readSnapshot(this.now()));
  }
  dispose(): void { this.stopped = true; this.cancelTimer?.(); }

  private async authorize() {
    this.authorizationCheck ??= (async () => {
      const result = await this.auth.inspectAuthenticationState();
      if (result.status === 'authorized') {
        const control = await this.repository.readControl();
        this.authorizationContext = { dataGeneration: control.dataGeneration, authEpoch: control.authEpoch };
      } else { this.authorizationContext = null; }
      return result;
    })();
    const pending = this.authorizationCheck;
    try { return await pending; }
    finally { if (this.authorizationCheck === pending) this.authorizationCheck = null; }
  }
  private authDto(result: Awaited<ReturnType<AuthenticationService['inspectAuthenticationState']>>) {
    if (result.status === 'owner-mismatch') return { status: result.status, bootstrap: result.bootstrap,
      localOwnerChannelId: result.localOwnerChannelId };
    return result;
  }
  private authControl(control: ControlState) {
    return authControlSchema.parse({ revision: control.revision, dataGeneration: control.dataGeneration,
      authEpoch: control.authEpoch, connectionGate: control.connectionGate, authorizationCheckDueAt: control.authorizationCheckDueAt,
      revocationStatus: control.revocationStatus, cacheInvalidationStatus: control.cacheInvalidationStatus,
      deletionStatus: control.deletionStatus, pendingCleanupReason: control.pendingCleanupReason, lastCleanupReason: control.lastCleanupReason });
  }
  private stamp(snapshot: LibrarySnapshot) {
    const control = snapshot.control;
    const validUntil = [snapshot.earliestExpiresAt, control.authorizationCheckDueAt]
      .filter((value): value is string => value !== null).sort()[0] ?? null;
    return { revision: control.revision, dataGeneration: control.dataGeneration, authEpoch: control.authEpoch,
      validUntil, lastCleanupReason: control.lastCleanupReason };
  }
  private async eligibleSnapshot(): Promise<LibrarySnapshot> {
    if (this.syncAuthorizationPending) throw new RuntimeBoundaryError(failure('authorization-pending'));
    const auth = await this.authorize();
    if (auth.status === 'owner-mismatch') throw new AuthenticationError('owner-mismatch');
    const snapshot = await this.repository.readSnapshot(this.now());
    if (auth.status === 'auth-required' && (snapshot.owner !== null || snapshot.videos.length || snapshot.sync !== null)) {
      throw new RuntimeBoundaryError(failure('data-unavailable'));
    }
    this.lifecycleFailure = null;
    this.arm(snapshot);
    return snapshot;
  }
  private pendingStatus(snapshot: LibrarySnapshot) {
    const current = snapshot.sync?.currentAttempt;
    return { status: 'validation-pending', revision: snapshot.control.revision,
      dataGeneration: snapshot.control.dataGeneration, authEpoch: snapshot.control.authEpoch,
      attempt: current ? { attemptId: current.attemptId, state: current.state } : null };
  }

  private async dispatch(request: RuntimeRequest): Promise<unknown> {
    // Teardown stays serviceable even if startup/recovery/storage has failed.
    if (request.operation === 'AUTH_DISCONNECT') {
      try { await this.initialize(); } catch { /* Service reports fencing/deletion outcomes independently. */ }
      for (const id of this.runs.keys()) this.sync.cancel(id);
      const result = await this.auth.disconnect();
      this.cancelTimer?.();
      if (result.fencing === 'succeeded' && result.deletion === 'succeeded') this.unsavedStatus = false;
      return { ...result, error: result.error?.detail ?? null };
    }
    await this.initialize();
    if (this.unsavedStatus) throw new StorageError('persistence');
    if (this.lifecycleFailure !== null) await this.enforceLifecycle();
    switch (request.operation) {
      case 'AUTH_STATUS_GET': {
        if (this.syncAuthorizationPending || this.authorizationCheck !== null) {
          const control = await this.repository.readControl();
          return { status: 'validation-pending', control: this.authControl(control) };
        }
        const result = await this.authorize();
        const snapshot = await this.repository.readSnapshot(this.now());
        this.arm(snapshot);
        return { ...this.authDto(snapshot.control.connectionGate === 'disconnected' ? { status: 'auth-required' } : result),
          control: this.authControl(snapshot.control) };
      }
      case 'AUTH_CONNECT': {
        if (this.runs.size || this.authorizationCheck !== null || this.connecting) throw new AuthenticationError('busy');
        this.connecting = true;
        try {
          const result: BootstrapResult = await this.auth.connectInteractively();
          this.arm(await this.repository.readSnapshot(this.now()));
          return this.authDto(result);
        } finally { this.connecting = false; }
      }
      case 'LIBRARY_SNAPSHOT_GET': {
        const snapshot = await this.eligibleSnapshot();
        return { ...this.stamp(snapshot), owner: snapshot.owner, videos: snapshot.videos, sync: snapshot.sync };
      }
      case 'SYNC_STATUS_GET': {
        if (this.syncAuthorizationPending || this.authorizationCheck !== null) {
          await this.repository.enforceRetention(this.now());
          const snapshot = await this.repository.readSnapshot(this.now());
          if (!this.authorizationKnown(snapshot)) return this.pendingStatus(snapshot);
        }
        const snapshot = await this.eligibleSnapshot();
        return { status: 'observed', ...this.stamp(snapshot), sync: snapshot.sync };
      }
      case 'SYNC_START': {
        if (this.authorizationCheck !== null || this.connecting) throw new AuthenticationError('busy');
        this.syncAuthorizationPending = this.runs.size === 0;
        try {
          const launch = await this.sync.start(request.requestId);
          if (launch.completion !== null && !this.runs.has(launch.attempt.attemptId)) {
            this.runs.set(launch.attempt.attemptId, launch.completion);
            void launch.completion.then(async (result) => {
              this.runs.delete(launch.attempt.attemptId);
              this.syncAuthorizationPending = false;
              if (result.status === 'status-unsaved') {
                this.unsavedStatus = true;
              }
              this.arm(await this.repository.readSnapshot(this.now()));
            }).catch((error: unknown) => { this.lifecycleFailure = error; });
          }
          return { status: launch.status, attempt: { attemptId: launch.attempt.attemptId, state: launch.attempt.state } };
        } catch (error) { if (!this.runs.size) this.syncAuthorizationPending = false; throw error; }
      }
    }
  }

  async handle(raw: unknown, sender: { id?: string; url?: string }): Promise<RuntimeResponse> {
    const parsed = requestSchema.safeParse(raw);
    const request = parsed.success ? parsed.data : null;
    const envelope = { protocolVersion: 1 as const, requestId: request?.requestId ?? null,
      operation: request?.operation ?? null };
    const reject = (error: RuntimeFailure): RuntimeResponse => ({ ...envelope, ok: false, error });
    if (!request) return reject(failure('invalid-request'));
    // Internal extension pages only. No content-script or externally-connectable
    // command path can cause interactive consent or destructive operations.
    if (sender.id !== this.extensionId || !sender.url?.startsWith(`chrome-extension://${this.extensionId}/`)) {
      return reject(failure('forbidden'));
    }
    // This MUST precede initialization, barriers and even bookkeeping reads.
    if (request.operation === 'SYNC_START' && this.options.providerValidationApproved !== true) {
      return reject(failure('provider-validation-required'));
    }
    try {
      const result = await this.dispatch(request);
      const checked = resultSchemas[request.operation].safeParse(result);
      if (!checked.success) return reject(failure('internal-error'));
      return { ...envelope, requestId: request.requestId, operation: request.operation, ok: true, result: checked.data };
    } catch (error) {
      if (error instanceof RuntimeBoundaryError) return reject(error.failure);
      if (error instanceof StorageError) return reject(failure('storage-error'));
      if (error instanceof AuthorizationCheckFailure) {
        const detail = ['auth-required', 'permission-denied'].includes(error.code) ? error.detail
          : { ...error.detail, category: 'authorization-unverified' as const, messageKey: 'access-unverified' as const };
        return reject(failure('auth-error', detail, error.cleanup));
      }
      if (error instanceof AuthenticationError) return reject(failure('auth-error', error.detail));
      return reject(failure('internal-error'));
    }
  }
}
