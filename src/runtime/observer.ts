import { isActiveAttempt } from '../domain/contracts';
import { RuntimeClient } from './client';
import { failure, type RevisionEvent, type RuntimeFailure, type RuntimeResult } from './contracts';
import type { LifecycleScheduler } from './coordinator';

type Snapshot = RuntimeResult<'LIBRARY_SNAPSHOT_GET'>;
export type LibraryObservation = { status: 'loading' } | { status: 'ready'; snapshot: Snapshot }
  | { status: 'unavailable'; error: RuntimeFailure };

// Reusable surface plumbing only; query/navigation/presentation remain future UI.
export class LibraryObserver {
  private state: LibraryObservation = { status: 'loading' };
  private minimumRevision = -1;
  private context: { dataGeneration: number; authEpoch: number } | null = null;
  private reading: Promise<void> | null = null;
  private dirty = false;
  private readEpoch = 0;
  private stopped = false;
  private cancelTimer: (() => void) | null = null;
  private lastClockSeen: string;
  private readonly unsubscribe: () => void;

  constructor(private readonly client: RuntimeClient, private readonly publish: (state: LibraryObservation) => void,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly scheduler: LifecycleScheduler = { schedule: (callback, delay) => {
      const timer = setTimeout(callback, delay); return () => clearTimeout(timer);
    } }) {
    this.lastClockSeen = this.now();
    this.unsubscribe = client.subscribe((event) => this.observeRevision(event));
  }
  // Auth DTOs can also supply authoritative control truth when a broadcast was
  // dropped. Both paths fence the same in-flight library read.
  observeRevision(event: Pick<RevisionEvent, 'revision' | 'dataGeneration' | 'authEpoch'>): void {
    if (this.stopped || event.revision <= this.minimumRevision) return;
    this.minimumRevision = event.revision;
    this.expireBeforeUse();
    // Progress hints do not revoke an eligible snapshot. Context changes do.
    if (this.context === null || event.dataGeneration !== this.context.dataGeneration
      || event.authEpoch !== this.context.authEpoch) this.set({ status: 'loading' });
    this.context = event;
    void this.refresh();
  }
  private set(state: LibraryObservation): void { this.state = state; if (!this.stopped) this.publish(state); }
  private expireBeforeUse(): void {
    const now = this.now();
    if (now < this.lastClockSeen) {
      this.set({ status: 'unavailable', error: failure('data-unavailable') });
      return;
    }
    this.lastClockSeen = now;
    if (this.state.status === 'ready' && this.state.snapshot.validUntil !== null
      && now >= this.state.snapshot.validUntil) {
      this.set({ status: 'unavailable', error: failure('data-unavailable') });
    }
  }
  // Surfaces call on mount/reconnection and focus/visibility resume. Expiration
  // happens synchronously before any cached Authorized Data can be reused.
  resume(): Promise<void> { this.expireBeforeUse(); return this.refresh(); }
  // A companion authoritative auth observation can close the same surface
  // gate before a delayed library reply arrives.
  invalidate(error: RuntimeFailure): void {
    if (this.stopped) return;
    ++this.readEpoch; this.dirty = false; this.cancelTimer?.();
    this.set({ status: 'unavailable', error });
  }
  refresh(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.expireBeforeUse();
    if (this.reading !== null) { this.dirty = true; return this.reading; }
    this.reading = this.read().finally(() => {
      this.reading = null;
      if (this.dirty && !this.stopped) { this.dirty = false; void this.refresh(); }
    });
    return this.reading;
  }
  private async read(): Promise<void> {
    const epoch = this.readEpoch;
    const result = await this.client.request('LIBRARY_SNAPSHOT_GET');
    if (this.stopped || epoch !== this.readEpoch) return;
    if (!result.ok) {
      this.cancelTimer?.();
      this.set({ status: 'unavailable', error: result.error });
      if (result.error.code === 'authorization-pending') {
        this.cancelTimer = this.scheduler.schedule(() => { void this.resume(); }, 2000);
      }
      return;
    }
    if (result.result.revision < this.minimumRevision) { this.dirty = true; return; }
    if (this.context !== null && (result.result.dataGeneration < this.context.dataGeneration
      || result.result.authEpoch < this.context.authEpoch
      || (result.result.revision === this.minimumRevision && (result.result.dataGeneration !== this.context.dataGeneration
        || result.result.authEpoch !== this.context.authEpoch)))) {
      this.cancelTimer?.();
      this.set({ status: 'unavailable', error: failure('data-unavailable') }); return;
    }
    this.minimumRevision = result.result.revision;
    if (this.now() < this.lastClockSeen || (result.result.validUntil !== null && this.now() >= result.result.validUntil)) {
      this.set({ status: 'unavailable', error: failure('data-unavailable') }); return;
    }
    this.lastClockSeen = this.now();
    this.context = result.result;
    this.cancelTimer?.();
    this.set({ status: 'ready', snapshot: result.result });
    const attempt = result.result.sync?.currentAttempt;
    const delays: number[] = [];
    if (attempt && isActiveAttempt(attempt.state)) delays.push(2000);
    if (result.result.validUntil !== null) delays.push(Math.max(1, Date.parse(result.result.validUntil) - Date.parse(this.now())));
    if (delays.length) this.cancelTimer = this.scheduler.schedule(() => { void this.resume(); }, Math.min(2_147_483_647, ...delays));
  }
  dispose(): void {
    this.stopped = true; this.unsubscribe(); this.cancelTimer?.();
    this.state = { status: 'loading' };
  }
}
