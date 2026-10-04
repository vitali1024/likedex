import { useEffect, useRef, useState } from 'react';
import { RuntimeClient } from '../runtime/client';
import type { ClientResult, RuntimeResult } from '../runtime/contracts';
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
    let cancelAuthTimer: ReturnType<typeof setTimeout> | null = null;
    const readAuth = async () => {
      if (disposed || document.visibilityState === 'hidden') return;
      const number = ++requestNumber;
      setAuth({ status: 'loading' });
      const result = await client.request('AUTH_STATUS_GET');
      if (disposed || number !== requestNumber) return;
      if (result.ok && result.result.control.revision < minimumRevision) {
        if (cancelAuthTimer !== null) clearTimeout(cancelAuthTimer);
        cancelAuthTimer = setTimeout(() => { void readAuth(); }, 2000);
        return;
      }
      if (result.ok) minimumRevision = Math.max(minimumRevision, result.result.control.revision);
      setAuth(result.ok ? { status: 'ready', value: result.result } : { status: 'unavailable', error: result.error });
      if (cancelAuthTimer !== null) clearTimeout(cancelAuthTimer);
      if (result.ok && result.result.status === 'validation-pending') {
        cancelAuthTimer = setTimeout(() => { void readAuth(); }, 2000);
      }
    };
    let observer: LibraryObserver | null = null;
    const createObserver = () => new LibraryObserver(client, (state) => {
      if (disposed || document.visibilityState === 'hidden') return;
      setLibrary(state);
      if (state.status === 'ready') {
        setStamp(`${state.snapshot.dataGeneration}:${state.snapshot.authEpoch}`);
        void readAuth();
      } else if (state.status === 'unavailable') { void readAuth(); }
    });
    const refresh = async () => {
      if (disposed || document.visibilityState === 'hidden') return;
      observer ??= createObserver();
      await Promise.all([observer.resume(), readAuth()]);
    };
    refreshRef.current = refresh;
    const unsubscribe = client.subscribe((event) => {
      minimumRevision = Math.max(minimumRevision, event.revision); void readAuth();
    });
    const resume = () => { void refresh(); };
    // A hidden surface immediately discards its rendered Authorized Data. On
    // return it passes the observer's clock/deadline gate before reusing data.
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        observer?.dispose(); observer = null;
        if (cancelAuthTimer !== null) clearTimeout(cancelAuthTimer);
        ++requestNumber; setAuth({ status: 'loading' }); setLibrary({ status: 'loading' });
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
  return { library, auth, stamp, refresh: () => refreshRef.current() };
}
