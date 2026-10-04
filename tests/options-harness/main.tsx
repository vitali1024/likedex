// Explicit separately built browser component composition. Never imported by
// entrypoints/ or src/. SYNC_START reaches the actual production background;
// its real storage is disconnected despite the Options-only fixture identity.
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { OptionsApp } from '../../src/options/OptionsApp';
import '../../src/options/options.css';
import { RuntimeClient } from '../../src/runtime/client';
import { failure, type RuntimeOperation } from '../../src/runtime/contracts';
import { optionsAuth, optionsSnapshot } from '../fixtures/options';
import { attempt, OBSERVED } from '../fixtures/storage';

export interface OptionsTestControl {
  calls: RuntimeOperation[];
  change(mode: string, count?: number): void;
}
let mode = new URL(location.href).searchParams.get('mode') ?? 'library';
let snapshot = optionsSnapshot();
let revision = 1;
const listeners = new Set<(event: unknown) => void>();
const calls: RuntimeOperation[] = [];
const control: OptionsTestControl = { calls, change(next, count) {
  mode = next;
  if (count !== undefined) snapshot = optionsSnapshot(count);
  snapshot.revision = ++revision;
  listeners.forEach((listener) => listener({ protocolVersion: 1, event: 'STATE_REVISION', revision, dataGeneration: 0, authEpoch: 0 }));
} };
(window as unknown as { optionsTest: OptionsTestControl }).optionsTest = control;
const client = new RuntimeClient({
  subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async send(request) {
    calls.push(request.operation);
    const response = (result: unknown) => ({ protocolVersion: 1, requestId: request.requestId, operation: request.operation, ok: true, result });
    const rejected = (code: Parameters<typeof failure>[0], detail: Parameters<typeof failure>[1] = null) => ({ protocolVersion: 1,
      requestId: request.requestId, operation: request.operation, ok: false, error: failure(code, detail) });
    if (request.operation === 'SYNC_START') return browser.runtime.sendMessage(request);
    if (request.operation === 'AUTH_CONNECT') {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (mode === 'connect-failure') return rejected('auth-error', { category: 'permission', messageKey: 'permission-denied', phase: 'preparing' });
      mode = 'connected-empty';
      const auth = optionsAuth();
      auth.control.revision = revision;
      const { control: ignored, ...result } = auth; void ignored;
      return response(result);
    }
    if (request.operation === 'AUTH_STATUS_GET') {
      if (mode === 'auth-error') return rejected('transport-error');
      const auth = optionsAuth();
      auth.control.revision = revision;
      if (mode === 'disconnected' || mode === 'connect-failure') return response({ status: 'auth-required', control: { ...auth.control, connectionGate: 'disconnected' } });
      if (mode === 'mismatch') return response({ status: 'owner-mismatch', control: auth.control,
        bootstrap: { channelId: 'owner-b', channelTitle: 'Different channel', likesPlaylistId: 'likes-owner-b' }, localOwnerChannelId: 'owner-a' });
      return response(auth);
    }
    if (request.operation === 'LIBRARY_SNAPSHOT_GET') {
      if (mode === 'snapshot-error') return rejected('storage-error');
      if (mode === 'mismatch') return rejected('auth-error', { category: 'owner-mismatch', messageKey: 'owner-mismatch', phase: 'preparing' });
      if (mode === 'loading') await new Promise(() => {});
      if (mode === 'disconnected' || mode === 'connect-failure' || mode === 'connected-empty') return response({ ...snapshot, owner: null, videos: [], sync: null });
      if (mode === 'active') return response({ ...snapshot, sync: { ...snapshot.sync!, currentAttempt: attempt({ pagesAccepted: 2, rawItems: 60, uniqueMembership: 60 }) } });
      if (mode === 'later-failure') return response({ ...snapshot, sync: { ...snapshot.sync!, currentAttempt: attempt({ state: 'failure', finishedAt: OBSERVED,
        error: { category: 'network', messageKey: 'network-failed', phase: 'scanning' } }) } });
      return response(snapshot);
    }
    return rejected('invalid-request');
  },
});
const root = document.getElementById('root');
if (!root) throw new Error('Test composition root missing');
createRoot(root).render(<OptionsApp client={client} surface={new URL(location.href).searchParams.get('surface') === 'sidepanel' ? 'sidepanel' : 'options'} />);
