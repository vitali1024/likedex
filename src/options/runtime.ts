import { RuntimeClient } from '../runtime/client';
import { failure, type ClientResult, type RuntimeResult } from '../runtime/contracts';
import { LibraryObserver, type LibraryObservation } from '../runtime/observer';
import type { LifecycleScheduler } from '../runtime/coordinator';

export type AuthObservation = { status: 'loading' } | { status: 'ready'; value: RuntimeResult<'AUTH_STATUS_GET'> }
  | { status: 'unavailable'; error: Extract<ClientResult<'AUTH_STATUS_GET'>, { ok: false }>['error'] };

// One mounted document's observations. No persistence and no worker keepalive.
// Inject the clock/scheduler so lifecycle races use the same code in unit tests.
export function createOptionsRuntime(client: RuntimeClient, publish: {
  library(state: LibraryObservation): void; auth(state: AuthObservation): void; stamp(value: string): void;
}, options: { hidden?: boolean; now?: () => string; scheduler?: LifecycleScheduler } = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const scheduler = options.scheduler ?? { schedule: (callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay); return () => clearTimeout(timer);
  } };
  let disposed = false, hidden = options.hidden ?? false, requestNumber = 0, minimumRevision = -1;
  let currentAuth: AuthObservation = { status: 'loading' };
  let currentLibrary: LibraryObservation = { status: 'loading' };
  let context: { dataGeneration: number; authEpoch: number } | null = null;
  let reading: Promise<void> | null = null, dirty = false, authNeedsRead = true;
  let cancelAuthTimer: (() => void) | null = null;
  let lastClockSeen = now();
  const publishAuth = (state: AuthObservation) => { currentAuth = state; publish.auth(state); };
  const sameContext = (value: { dataGeneration: number; authEpoch: number }) => context === null
    || (value.dataGeneration === context.dataGeneration && value.authEpoch === context.authEpoch);
  const authDue = () => currentAuth.status === 'ready' && currentAuth.value.control.connectionGate === 'connected'
    && (currentAuth.value.control.authorizationCheckDueAt === null || now() >= currentAuth.value.control.authorizationCheckDueAt);
  const guard = () => {
    const clock = now();
    const backward = clock < lastClockSeen;
    if (!backward) lastClockSeen = clock;
    if (backward || authDue()) {
      publishAuth({ status: 'loading' }); authNeedsRead = true;
      observer.invalidate(failure('data-unavailable'));
    }
    observer.expireBeforeUse();
  };
  const armAuth = (retry = false) => {
    cancelAuthTimer?.(); cancelAuthTimer = null;
    if (disposed || hidden) return;
    if (retry || (currentAuth.status === 'ready' && currentAuth.value.status === 'validation-pending')) {
      cancelAuthTimer = scheduler.schedule(() => { authNeedsRead = true; void resumeIfNeeded(); }, 2000);
    } else if (currentAuth.status === 'ready' && currentAuth.value.control.connectionGate === 'connected'
      && currentAuth.value.control.authorizationCheckDueAt !== null) {
      cancelAuthTimer = scheduler.schedule(() => { void resumeIfNeeded(); },
        Math.min(2_147_483_647, Math.max(1, Date.parse(currentAuth.value.control.authorizationCheckDueAt) - Date.parse(now()))));
    }
  };
  const read = async () => {
    const number = ++requestNumber;
    const result = await client.request('AUTH_STATUS_GET');
    if (disposed || number !== requestNumber) return;
    if (now() < lastClockSeen) {
      publishAuth({ status: 'unavailable', error: failure('data-unavailable') });
      observer.invalidate(failure('data-unavailable')); return;
    }
    lastClockSeen = now();
    if (result.ok && result.result.control.revision < minimumRevision) { authNeedsRead = true; armAuth(true); return; }
    if (result.ok && context !== null && (result.result.control.dataGeneration < context.dataGeneration
      || result.result.control.authEpoch < context.authEpoch
      || (!sameContext(result.result.control) && result.result.control.revision <= minimumRevision))) {
      publishAuth({ status: 'loading' }); observer.invalidate(failure('data-unavailable')); return;
    }
    if (result.ok) {
      authNeedsRead = false;
      minimumRevision = Math.max(minimumRevision, result.result.control.revision);
      observer.observeRevision(result.result.control);
      context = result.result.control;
    }
    const keepAuthorized = result.ok && result.result.status === 'validation-pending'
      && result.result.control.connectionGate === 'connected' && result.result.control.pendingCleanupReason === null
      && currentAuth.status === 'ready' && currentAuth.value.status === 'authorized'
      && sameContext(currentAuth.value.control)
      && currentAuth.value.control.authorizationCheckDueAt !== null
      && now() < currentAuth.value.control.authorizationCheckDueAt;
    const controlIneligible = result.ok && (result.result.control.pendingCleanupReason !== null
      || (result.result.control.connectionGate === 'connected'
        && (result.result.control.authorizationCheckDueAt === null || now() >= result.result.control.authorizationCheckDueAt)));
    // A pending companion check must not repeatedly cancel the first library
    // read: that request establishes its own authoritative authorization. Once
    // data is ready, pending/required/mismatch still closes the presentation gate.
    if (!result.ok || (currentLibrary.status === 'ready' && (result.result.status === 'auth-required'
      || result.result.status === 'owner-mismatch' || (result.result.status === 'validation-pending' && !keepAuthorized)))
      || controlIneligible) {
      observer.invalidate(result.ok ? failure(result.result.status === 'validation-pending' ? 'authorization-pending' : 'data-unavailable') : result.error);
    }
    const identityIneligible = controlIneligible && result.ok
      && (result.result.status === 'authorized' || result.result.status === 'owner-mismatch');
    if (identityIneligible || (result.ok && result.result.status === 'validation-pending')) authNeedsRead = true;
    if (!keepAuthorized) publishAuth(identityIneligible ? { status: 'loading' }
      : result.ok ? { status: 'ready', value: result.result } : { status: 'unavailable', error: result.error });
    if (result.ok && result.result.status === 'authorized' && currentLibrary.status === 'unavailable'
      && currentLibrary.error.code === 'authorization-pending') void observer.resumeIfNeeded();
    armAuth(identityIneligible || (result.ok && result.result.status === 'validation-pending'));
  };
  const readAuth = (force = false): Promise<void> => {
    if (disposed || hidden) { if (force) authNeedsRead = true; return Promise.resolve(); }
    if (reading !== null) { if (force) dirty = true; return reading; }
    if (!force && !authNeedsRead && currentAuth.status === 'ready' && currentAuth.value.status !== 'validation-pending' && !authDue()) {
      armAuth(); return Promise.resolve();
    }
    authNeedsRead = false; dirty = false;
    reading = read().finally(() => {
      reading = null;
      if (dirty && !disposed) { authNeedsRead = true; if (!hidden) void readAuth(); }
    });
    return reading;
  };
  const observer = new LibraryObserver(client, (state) => {
    if (disposed) return;
    currentLibrary = state; publish.library(state);
    if (state.status === 'ready') {
      if (state.snapshot.revision > minimumRevision) authNeedsRead = true;
      minimumRevision = Math.max(minimumRevision, state.snapshot.revision);
      if (!sameContext(state.snapshot)) {
        ++requestNumber; publishAuth({ status: 'loading' }); authNeedsRead = true;
        if (reading !== null) dirty = true;
      }
      context = state.snapshot;
      publish.stamp(`${state.snapshot.dataGeneration}:${state.snapshot.authEpoch}`);
      void readAuth();
    } else {
      // Remove identity immediately at a real library barrier, even while hidden.
      publishAuth({ status: 'loading' });
      if (state.status === 'unavailable') void readAuth();
    }
  }, now, scheduler);
  if (hidden) observer.suspend();
  const unsubscribe = client.subscribe((event) => {
    if (event.revision <= minimumRevision) return;
    minimumRevision = event.revision;
    if (!sameContext(event)) { ++requestNumber; publishAuth({ status: 'loading' }); }
    context = event; authNeedsRead = true;
    if (reading !== null) dirty = true;
    if (!hidden) void readAuth();
  });
  function resumeIfNeeded(): Promise<void> {
    if (disposed) return Promise.resolve();
    hidden = false;
    guard();
    return Promise.all([observer.resumeIfNeeded(), readAuth()]).then(() => {});
  }
  return {
    resumeIfNeeded,
    suspend() {
      if (disposed || hidden) return;
      hidden = true; guard(); observer.suspend();
      cancelAuthTimer?.(); cancelAuthTimer = null;
    },
    async refresh() {
      if (disposed) return;
      guard();
      await Promise.all([observer.resume(), readAuth(true)]);
    },
    dispose() {
      disposed = true; ++requestNumber; observer.dispose(); unsubscribe(); cancelAuthTimer?.();
    },
  };
}
