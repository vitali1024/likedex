import { useCallback, useEffect, useRef, useState } from 'react';
import { RuntimeClient } from '../runtime/client';
import type { LibraryObservation } from '../runtime/observer';
import { createOptionsRuntime, type AuthObservation } from './runtime';

export type { AuthObservation } from './runtime';

export function useOptionsRuntime(client: RuntimeClient) {
  const [library, setLibrary] = useState<LibraryObservation>({ status: 'loading' });
  const [auth, setAuth] = useState<AuthObservation>({ status: 'loading' });
  const [stamp, setStamp] = useState('initial');
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const runtime = createOptionsRuntime(client, { library: setLibrary, auth: setAuth, stamp: setStamp },
      { hidden: document.visibilityState === 'hidden' });
    refreshRef.current = runtime.refresh;
    const resume = () => { if (document.visibilityState !== 'hidden') void runtime.resumeIfNeeded(); };
    const visibility = () => { if (document.visibilityState === 'hidden') runtime.suspend(); else resume(); };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visibility);
    resume();
    return () => {
      runtime.dispose();
      window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', visibility);
      refreshRef.current = async () => {};
    };
  }, [client]);
  const refresh = useCallback(() => refreshRef.current(), []);
  return { library, auth, stamp, refresh };
}
