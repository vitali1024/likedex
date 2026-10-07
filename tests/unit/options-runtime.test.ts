import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOptionsRuntime, type AuthObservation } from '@/src/options/runtime';
import { RuntimeClient } from '@/src/runtime/client';
import type { LibraryObservation } from '@/src/runtime/observer';
import { failure, type RuntimeOperation, type RuntimeRequest, type RuntimeResult } from '@/src/runtime/contracts';
import { held } from '../fixtures/authentication';
import { optionsAuth, optionsSnapshot } from '../fixtures/options';
import { attempt, NOW } from '../fixtures/storage';

const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function setup(active = false, hidden = false) {
  let now = NOW;
  let snapshot = optionsSnapshot();
  let auth: RuntimeResult<'AUTH_STATUS_GET'> = optionsAuth();
  if (active) snapshot.sync!.currentAttempt = attempt({ state: 'scanning' });
  let authFailure = false;
  const listeners = new Set<(event: unknown) => void>();
  const libraries: LibraryObservation[] = [], identities: AuthObservation[] = [], stamps: string[] = [];
  const holds = new Map<RuntimeOperation, ReturnType<typeof held<unknown>>>();
  const send = vi.fn(async (request: RuntimeRequest) => {
    // Capture a coherent response at request time to exercise stale reply races.
    const result = structuredClone(request.operation === 'AUTH_STATUS_GET' ? auth : snapshot);
    const rejected = request.operation === 'AUTH_STATUS_GET' && authFailure;
    await holds.get(request.operation)?.promise;
    return { protocolVersion: 1, requestId: request.requestId, operation: request.operation,
      ...(rejected ? { ok: false, error: failure('transport-error') } : { ok: true, result }) };
  });
  const runtime = createOptionsRuntime(new RuntimeClient({ send, subscribe(listener) {
    listeners.add(listener); return () => { listeners.delete(listener); };
  } }), { library: (state) => libraries.push(state), auth: (state) => identities.push(state), stamp: (stamp) => stamps.push(stamp) },
  { hidden, now: () => now });
  const count = (operation: RuntimeOperation) => send.mock.calls.filter(([request]) => request.operation === operation).length;
  return { runtime, libraries, identities, stamps, count, send,
    library: () => libraries.at(-1), auth: () => identities.at(-1),
    setNow(value: string) { now = value; },
    hold(operation: RuntimeOperation) { holds.set(operation, held<unknown>()); },
    release(operation: RuntimeOperation) { const pending = holds.get(operation); holds.delete(operation); pending?.resolve(null); },
    update(values: Partial<RuntimeResult<'LIBRARY_SNAPSHOT_GET'>>) { snapshot = { ...snapshot, ...values }; },
    setAuth(value: RuntimeResult<'AUTH_STATUS_GET'>) { auth = value; },
    failAuth() { authFailure = true; },
    notify(revision: number, dataGeneration = 0, authEpoch = 0) {
      snapshot = { ...snapshot, revision, dataGeneration, authEpoch };
      auth = { ...auth, control: { ...auth.control, revision, dataGeneration, authEpoch } };
      listeners.forEach((listener) => listener({ protocolVersion: 1, event: 'STATE_REVISION', revision, dataGeneration, authEpoch }));
    },
  };
}
type Harness = ReturnType<typeof setup>;
const counts = (h: Harness) => [h.count('LIBRARY_SNAPSHOT_GET'), h.count('AUTH_STATUS_GET')];
const expectReady = (h: Harness) => {
  expect(h.library()).toMatchObject({ status: 'ready', snapshot: { videos: expect.any(Array) } });
  expect(h.auth()).toMatchObject({ status: 'ready', value: { status: 'authorized' } });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('Same-document Options / Side Panel lifecycle', () => {
  it('first mount and actual remount each establish fresh auth and library truth', async () => {
    for (let i = 0; i < 2; i++) {
      const h = setup(); expect(h.libraries).toEqual([]); expect(h.identities).toEqual([]);
      await h.runtime.resumeIfNeeded(); expectReady(h); expect(counts(h)).toEqual([1, 1]); h.runtime.dispose();
    }
  });
  it('five short idle hide/show cycles retain ready rows/auth without loading or reads', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded();
    const library = h.library(), auth = h.auth(), before = [h.libraries.length, h.identities.length];
    for (let i = 0; i < 5; i++) {
      h.runtime.suspend(); expectReady(h);
      await h.runtime.resumeIfNeeded(); await h.runtime.resumeIfNeeded();
      expect(h.library()).toBe(library); expect(h.auth()).toBe(auth);
      expect(counts(h)).toEqual([1, 1]);
    }
    expect([h.libraries.length, h.identities.length]).toEqual(before); h.runtime.dispose();
  });
  it('focus alone leaves an idle eligible observation and its timers intact', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded();
    await h.runtime.resumeIfNeeded(); expectReady(h); expect(counts(h)).toEqual([1, 1]);
    expect(vi.getTimerCount()).toBe(2); h.runtime.dispose();
  });
  it('active Sync pauses hidden polling and visibility plus focus makes one catch-up read', async () => {
    const h = setup(true); await h.runtime.resumeIfNeeded(); const old = h.library();
    h.runtime.suspend(); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000); expect(counts(h)).toEqual([1, 1]);
    h.update({ sync: { ...optionsSnapshot().sync!, currentAttempt: attempt({ state: 'scanning', rawItems: 200 }) } });
    h.hold('LIBRARY_SNAPSHOT_GET');
    const visible = h.runtime.resumeIfNeeded(), focus = h.runtime.resumeIfNeeded();
    expect(h.library()).toBe(old); expectReady(h); expect(counts(h)).toEqual([2, 1]);
    h.release('LIBRARY_SNAPSHOT_GET'); await Promise.all([visible, focus]); await settle();
    expect(h.library()).toMatchObject({ status: 'ready', snapshot: { sync: { currentAttempt: { rawItems: 200 } } } });
    expect(counts(h)).toEqual([2, 1]);
    await vi.advanceTimersByTimeAsync(2000); expect(counts(h)).toEqual([3, 1]); h.runtime.dispose();
  });
  it('hidden same-context revisions defer and coalesce reads while preserving eligible presentation', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded(); const old = h.library();
    h.runtime.suspend(); h.notify(2); h.notify(3); h.notify(4);
    expect(h.library()).toBe(old); expectReady(h); expect(counts(h)).toEqual([1, 1]);
    h.hold('LIBRARY_SNAPSHOT_GET'); h.hold('AUTH_STATUS_GET');
    const visible = h.runtime.resumeIfNeeded(), focus = h.runtime.resumeIfNeeded();
    expectReady(h); expect(counts(h)).toEqual([2, 2]);
    h.release('LIBRARY_SNAPSHOT_GET'); h.release('AUTH_STATUS_GET');
    await Promise.all([visible, focus]); await settle();
    expect(h.library()).toMatchObject({ status: 'ready', snapshot: { revision: 4 } });
    expect(counts(h)).toEqual([2, 2]); h.runtime.dispose();
  });
  it.each(['generation', 'epoch'] as const)('hidden %s change fences rows and identity before return and rejects held replies', async (boundary) => {
    const h = setup(); await h.runtime.resumeIfNeeded();
    h.hold('LIBRARY_SNAPSHOT_GET'); h.hold('AUTH_STATUS_GET'); const refresh = h.runtime.refresh();
    h.runtime.suspend(); h.update({ videos: [], owner: null, sync: null });
    h.notify(2, boundary === 'generation' ? 1 : 0, boundary === 'epoch' ? 1 : 0);
    expect(h.library()).toEqual({ status: 'loading' }); expect(h.auth()).toEqual({ status: 'loading' });
    h.release('LIBRARY_SNAPSHOT_GET'); h.release('AUTH_STATUS_GET'); await refresh; await settle();
    expect(h.library()).toEqual({ status: 'loading' }); expect(h.auth()).toEqual({ status: 'loading' });
    const before = h.libraries.length;
    await h.runtime.resumeIfNeeded(); await settle();
    expect(h.libraries.slice(before)).not.toContainEqual(expect.objectContaining({ snapshot: expect.objectContaining({ videos: expect.arrayContaining([expect.anything()]) }) }));
    expect(h.library()).toMatchObject({ status: 'ready', snapshot: { videos: [] } }); h.runtime.dispose();
  });
  it('expiry while hidden fences content synchronously before a held fresh read', async () => {
    const h = setup(); h.update({ validUntil: '2026-10-05T00:00:00.000Z' }); await h.runtime.resumeIfNeeded();
    h.runtime.suspend(); h.setNow('2026-10-05T00:00:00.000Z'); h.hold('LIBRARY_SNAPSHOT_GET');
    const resume = h.runtime.resumeIfNeeded(); expect(h.library()).toMatchObject({ status: 'unavailable' });
    h.release('LIBRARY_SNAPSHOT_GET'); await resume; expect(h.library()).toMatchObject({ status: 'unavailable' }); h.runtime.dispose();
  });
  it('authorization deadline while hidden closes both gates before checking silently', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded(); h.runtime.suspend();
    h.setNow('2026-10-15T00:00:00.000Z'); h.hold('AUTH_STATUS_GET'); h.hold('LIBRARY_SNAPSHOT_GET');
    const resume = h.runtime.resumeIfNeeded(); h.runtime.resumeIfNeeded();
    expect(h.library()).toMatchObject({ status: 'unavailable' }); expect(h.auth()).toEqual({ status: 'loading' });
    expect(counts(h)).toEqual([2, 2]);
    h.release('LIBRARY_SNAPSHOT_GET'); h.release('AUTH_STATUS_GET'); await resume; h.runtime.dispose();
  });
  it('backward clock while hidden fences both observations and rejects delayed successes', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded(); h.runtime.suspend(); h.setNow('2026-10-03T00:00:00.000Z');
    const resume = h.runtime.resumeIfNeeded(); expect(h.library()).toMatchObject({ status: 'unavailable' });
    expect(h.auth()).not.toMatchObject({ status: 'ready' }); await resume;
    expect(h.library()).toMatchObject({ status: 'unavailable' }); expect(h.auth()).not.toMatchObject({ status: 'ready' }); h.runtime.dispose();
  });
  it('explicit refresh still forces both reads while retaining eligible rows', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded(); const old = h.library();
    h.hold('LIBRARY_SNAPSHOT_GET'); const refresh = h.runtime.refresh(); expect(h.library()).toBe(old);
    h.release('LIBRARY_SNAPSHOT_GET'); await refresh; expect(counts(h)).toEqual([2, 2]); h.runtime.dispose();
  });
  it('a newer revision during catch-up rejects stale replies and rereads both authorities', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded(); h.runtime.suspend(); h.notify(2);
    h.hold('LIBRARY_SNAPSHOT_GET'); h.hold('AUTH_STATUS_GET'); const resume = h.runtime.resumeIfNeeded();
    h.notify(3); h.runtime.resumeIfNeeded();
    h.release('LIBRARY_SNAPSHOT_GET'); h.release('AUTH_STATUS_GET'); await resume; await settle();
    expect(h.library()).toMatchObject({ status: 'ready', snapshot: { revision: 3 } });
    expect(h.auth()).toMatchObject({ status: 'ready', value: { control: { revision: 3 } } });
    expect(h.libraries).not.toContainEqual(expect.objectContaining({ snapshot: expect.objectContaining({ revision: 2 }) }));
    expect(counts(h)).toEqual([3, 3]); h.runtime.dispose();
  });
  it('auth failure fences a held library reply without reread loops', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded(); h.failAuth(); h.hold('LIBRARY_SNAPSHOT_GET');
    const refresh = h.runtime.refresh(); await settle(); expect(h.library()).toMatchObject({ status: 'unavailable' });
    h.release('LIBRARY_SNAPSHOT_GET'); await refresh; await settle();
    expect(h.library()).toMatchObject({ status: 'unavailable' }); expect(h.auth()).toMatchObject({ status: 'unavailable' });
    expect(counts(h)).toEqual([2, 2]); h.runtime.dispose();
  });
  it('same-context auth pending keeps identity only before its deadline and still retries', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded();
    h.setAuth({ status: 'validation-pending', control: optionsAuth().control }); await h.runtime.refresh(); expectReady(h);
    await vi.advanceTimersByTimeAsync(2000); expect(h.count('AUTH_STATUS_GET')).toBe(3);
    h.runtime.suspend(); h.setNow('2026-10-15T00:00:00.000Z'); await h.runtime.resumeIfNeeded();
    expect(h.library()).toMatchObject({ status: 'unavailable' });
    expect(h.auth()).toMatchObject({ status: 'ready', value: { status: 'validation-pending' } }); h.runtime.dispose();
  });
  it('a mounted hidden surface waits for visibility to establish its first observations', async () => {
    const h = setup(false, true); await h.runtime.refresh(); expect(counts(h)).toEqual([0, 0]);
    await h.runtime.resumeIfNeeded(); expectReady(h); expect(counts(h)).toEqual([1, 1]); h.runtime.dispose();
  });
  it('initial pending auth does not cancel the independently authorized library read in a retry loop', async () => {
    const h = setup(); const control = { ...optionsAuth().control, connectionGate: 'disconnected' as const, authorizationCheckDueAt: null };
    h.update({ videos: [], owner: null, sync: null, validUntil: null });
    h.setAuth({ status: 'validation-pending', control }); h.hold('LIBRARY_SNAPSHOT_GET');
    const mount = h.runtime.resumeIfNeeded(); await settle();
    expect(h.auth()).toMatchObject({ status: 'ready', value: { status: 'validation-pending' } });
    h.setAuth({ status: 'auth-required', control }); h.release('LIBRARY_SNAPSHOT_GET');
    await mount; await settle();
    expect(h.auth()).toMatchObject({ status: 'ready', value: { status: 'auth-required' } });
    // The first control revision arrived during the initial library read, so
    // one revision-driven reread is necessary; subsequent timers must settle.
    expect(counts(h)).toEqual([2, 2]);
    await vi.advanceTimersByTimeAsync(4000); expect(counts(h)).toEqual([2, 2]); h.runtime.dispose();
  });
  it('two independently mounted surfaces retain their own eligible state', async () => {
    const full = setup(), panel = setup(); await full.runtime.resumeIfNeeded(); await panel.runtime.resumeIfNeeded();
    full.runtime.suspend(); expectReady(panel); await full.runtime.resumeIfNeeded();
    expectReady(full); expectReady(panel); expect(counts(full)).toEqual([1, 1]); expect(counts(panel)).toEqual([1, 1]);
    full.runtime.dispose(); panel.runtime.dispose();
  });
  it('a hidden in-flight auth failure immediately fences the retained observations', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded(); h.failAuth(); h.hold('AUTH_STATUS_GET');
    const refresh = h.runtime.refresh(); h.runtime.suspend(); h.release('AUTH_STATUS_GET'); await refresh;
    expect(h.library()).toMatchObject({ status: 'unavailable' }); expect(h.auth()).toMatchObject({ status: 'unavailable' });
    h.runtime.dispose();
  });
  it('hidden retained identity does not suppress a pending authorization retry on return', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded();
    h.setAuth({ status: 'validation-pending', control: optionsAuth().control }); await h.runtime.refresh();
    h.runtime.suspend(); expectReady(h); expect(vi.getTimerCount()).toBe(0);
    h.setAuth(optionsAuth()); await h.runtime.resumeIfNeeded(); expect(h.count('AUTH_STATUS_GET')).toBe(3);
    expectReady(h); h.runtime.dispose();
  });
  it('an auth gate fencing an in-flight snapshot still allows a necessary recovery read', async () => {
    const h = setup(); await h.runtime.resumeIfNeeded(); h.hold('LIBRARY_SNAPSHOT_GET');
    const refresh = h.runtime.refresh(); await settle(); h.runtime.suspend();
    h.setNow('2026-10-15T00:00:00.000Z');
    const auth = optionsAuth(); auth.control.authorizationCheckDueAt = '2026-10-16T00:00:00.000Z';
    h.setAuth(auth); h.update({ validUntil: '2026-10-16T00:00:00.000Z' });
    const resume = h.runtime.resumeIfNeeded(); expect(h.library()).toMatchObject({ status: 'unavailable' });
    h.release('LIBRARY_SNAPSHOT_GET'); await Promise.all([refresh, resume]); await settle();
    expectReady(h); expect(h.count('LIBRARY_SNAPSHOT_GET')).toBe(3); h.runtime.dispose();
  });
});
