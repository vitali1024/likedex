import { useCallback, useEffect, useRef, useState } from 'react';
import { RuntimeClient } from '../runtime/client';
import { failure, type ClientResult, type RuntimeResult } from '../runtime/contracts';
import { LibraryObserver, type LibraryObservation } from '../runtime/observer';

export type AuthObservation = { status: 'loading' } | { status: 'ready'; value: RuntimeResult<'AUTH_STATUS_GET'> }
  | { status: 'unavailable'; error: Extract<ClientResult<'AUTH_STATUS_GET'>, { ok: false }>['error'] };

export function useOptionsRuntime(client: RuntimeClient) {
  const [library, setLibrary] = useState<LibraryObservation>({ status: 'loading' });
  const [auth, setAuth] = useState<AuthObservation>({ status: 'loading' });
  const [stamp, setStamp] = useState('initial');
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let disposed = false, requestNumber = 0, minimumRevision = -1;
    let currentAuth: AuthObservation = { status: 'loading' };
    let currentLibrary: LibraryObservation = { status: 'loading' };
    let context: { dataGeneration: number; authEpoch: number } | null = null;
    let reading: Promise<void> | null = null, dirty = false;
    let cancelAuthTimer: ReturnType<typeof setTimeout> | null = null;
    const publishAuth = (state: AuthObservation) => { currentAuth = state; setAuth(state); };
    const sameContext = (value: { dataGeneration: number; authEpoch: number }) => context === null
      || (value.dataGeneration === context.dataGeneration && value.authEpoch === context.authEpoch);
    const read = async () => {
      if (disposed || document.visibilityState === 'hidden') return;
      const number = ++requestNumber;
      // Keep a still-authorized identity during an ordinary local refresh.
      if (currentAuth.status === 'ready' && currentAuth.value.status === 'authorized'
        && (currentAuth.value.control.authorizationCheckDueAt === null
          || new Date().toISOString() >= currentAuth.value.control.authorizationCheckDueAt)) {
        publishAuth({ status: 'loading' });
      }
      const result = await client.request('AUTH_STATUS_GET');
      if (disposed || number !== requestNumber) return;
      if (result.ok && result.result.control.revision < minimumRevision) {
        if (cancelAuthTimer !== null) clearTimeout(cancelAuthTimer);
        cancelAuthTimer = setTimeout(() => { void readAuth(); }, 2000);
        return;
      }
      if (result.ok && context !== null && (result.result.control.dataGeneration < context.dataGeneration
        || result.result.control.authEpoch < context.authEpoch
        || (!sameContext(result.result.control) && result.result.control.revision <= minimumRevision))) {
        publishAuth({ status: 'loading' });
        observer?.invalidate(failure('data-unavailable')); return;
      }
      if (result.ok) {
        minimumRevision = Math.max(minimumRevision, result.result.control.revision);
        observer?.observeRevision(result.result.control);
        context = result.result.control;
      }
      const keepAuthorized = result.ok && result.result.status === 'validation-pending'
        && result.result.control.connectionGate === 'connected' && result.result.control.pendingCleanupReason === null
        && currentAuth.status === 'ready' && currentAuth.value.status === 'authorized'
        && sameContext(currentAuth.value.control)
        && currentAuth.value.control.authorizationCheckDueAt !== null
        && new Date().toISOString() < currentAuth.value.control.authorizationCheckDueAt;
      if (currentLibrary.status === 'ready' && (!result.ok || result.result.status === 'auth-required'
        || result.result.status === 'owner-mismatch' || (result.result.status === 'validation-pending' && !keepAuthorized))) {
        observer?.invalidate(result.ok ? failure(result.result.status === 'validation-pending' ? 'authorization-pending' : 'data-unavailable') : result.error);
      }
      if (!keepAuthorized) publishAuth(result.ok ? { status: 'ready', value: result.result } : { status: 'unavailable', error: result.error });
      if (result.ok && result.result.status === 'authorized' && currentLibrary.status === 'unavailable'
        && currentLibrary.error.code === 'authorization-pending') void observer?.resume();
      if (cancelAuthTimer !== null) clearTimeout(cancelAuthTimer);
      if (result.ok && result.result.status === 'validation-pending') {
        cancelAuthTimer = setTimeout(() => { void readAuth(); }, 2000);
      } else if (result.ok && result.result.status === 'authorized' && result.result.control.authorizationCheckDueAt !== null) {
        cancelAuthTimer = setTimeout(() => { publishAuth({ status: 'loading' }); void readAuth(); },
          Math.min(2_147_483_647, Math.max(1, Date.parse(result.result.control.authorizationCheckDueAt) - Date.now())));
      }
    };
    const readAuth = (): Promise<void> => {
      if (disposed || document.visibilityState === 'hidden') return Promise.resolve();
      if (reading !== null) { dirty = true; return reading; }
      reading = read().finally(() => {
        reading = null;
        if (dirty && !disposed) { dirty = false; void readAuth(); }
      });
      return reading;
    };
    let observer: LibraryObserver | null = null;
    const createObserver = () => new LibraryObserver(client, (state) => {
      if (disposed || document.visibilityState === 'hidden') return;
      currentLibrary = state;
      setLibrary(state);
      if (state.status === 'ready') {
        minimumRevision = Math.max(minimumRevision, state.snapshot.revision);
        if (!sameContext(state.snapshot)) publishAuth({ status: 'loading' });
        context = state.snapshot;
        setStamp(`${state.snapshot.dataGeneration}:${state.snapshot.authEpoch}`);
        void readAuth();
      } else {
        publishAuth({ status: 'loading' });
        if (state.status === 'unavailable') void readAuth();
      }
    });
    const refresh = async () => {
      if (disposed || document.visibilityState === 'hidden') return;
      observer ??= createObserver();
      await Promise.all([observer.resume(), readAuth()]);
    };
    refreshRef.current = refresh;
    const unsubscribe = client.subscribe((event) => {
      if (event.revision <= minimumRevision) return;
      minimumRevision = event.revision;
      if (!sameContext(event)) { ++requestNumber; publishAuth({ status: 'loading' }); }
      context = event;
      void readAuth();
    });
    const resume = () => { void refresh(); };
    // A hidden surface immediately discards its rendered Authorized Data. On
    // return it passes the observer's clock/deadline gate before reusing data.
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        observer?.dispose(); observer = null;
        if (cancelAuthTimer !== null) clearTimeout(cancelAuthTimer);
        ++requestNumber; publishAuth({ status: 'loading' }); currentLibrary = { status: 'loading' }; setLibrary(currentLibrary);
      } else resume();
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visibility);
    void refresh();
    return () => {
      disposed = true; ++requestNumber; observer?.dispose(); unsubscribe();
      if (cancelAuthTimer !== null) clearTimeout(cancelAuthTimer);
      window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', visibility);
      refreshRef.current = async () => {};
    };
  }, [client]);
  const refresh = useCallback(() => refreshRef.current(), []);
  return { library, auth, stamp, refresh };
}
