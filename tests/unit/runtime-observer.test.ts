import { describe, expect, it, vi } from 'vitest';
import { RuntimeClient, type RuntimeTransport } from '@/src/runtime/client';
import { LibraryObserver, type LibraryObservation } from '@/src/runtime/observer';
import type { RuntimeRequest, RuntimeResult } from '@/src/runtime/contracts';
import { NOW, attempt, video } from '../fixtures/storage';
import { held } from '../fixtures/authentication';

function snapshot(revision = 1): RuntimeResult<'LIBRARY_SNAPSHOT_GET'> {
  return { revision, dataGeneration: 0, authEpoch: 1, validUntil: '2026-10-05T12:00:00.000Z',
    lastCleanupReason: null, owner: null, videos: [video()], sync: null };
}
function setup(initial = snapshot()) {
  let now = NOW;
  let listener: (event: unknown) => void = () => {};
  let callback: () => void = () => {};
  const replies: LibraryObservation[] = [];
  const send = vi.fn<(request: RuntimeRequest) => Promise<unknown>>().mockImplementation(async (request) =>
    ({ protocolVersion: 1, requestId: request.requestId, operation: request.operation, ok: true, result: initial }));
  const transport: RuntimeTransport = { send, subscribe: (receive) => { listener = receive; return () => { listener = () => {}; }; } };
  const schedule = vi.fn().mockImplementation((receive: () => void) => { callback = receive; return () => {}; });
  const observer = new LibraryObserver(new RuntimeClient(transport), (state) => replies.push(state), () => now, { schedule });
  return { observer, send, replies, schedule, notify: (revision: number, dataGeneration = 0, authEpoch = 1) => listener({ protocolVersion: 1,
    event: 'STATE_REVISION', revision, dataGeneration, authEpoch }),
  setNow: (value: string) => { now = value; }, fire: () => callback() };
}

describe('Surface observer foundation (AC-STORAGE-004; AC-DATA-014; AC-SYNC-011)', () => {
  it('keeps an eligible active library throughout page revision bursts and rejects an in-flight old reply', async () => {
    const initial = snapshot(); initial.sync = { currentAttempt: attempt({ state: 'scanning' }),
      previousCompletedResult: null, latestSuccessfulSync: null, lastMirrorChangeRevision: 0, lastFinalizedMirrorRevision: null };
    const h = setup(initial); await h.observer.resume();
    const pending = held<unknown>();
    h.send.mockImplementationOnce(async (request) => {
      await pending.promise;
      return { protocolVersion: 1, requestId: request.requestId, operation: request.operation, ok: true, result: snapshot(2) };
    }).mockImplementation(async (request) => ({ protocolVersion: 1, requestId: request.requestId,
      operation: request.operation, ok: true, result: snapshot(10) }));
    for (let revision = 2; revision <= 10; revision++) {
      h.notify(revision); expect(h.replies.at(-1)).toEqual({ status: 'ready', snapshot: initial });
    }
    expect(h.send).toHaveBeenCalledTimes(2);
    pending.resolve(null);
    await vi.waitFor(() => expect(h.replies.at(-1)).toMatchObject({ status: 'ready', snapshot: { revision: 10 } }));
    expect(h.replies.every((state) => state.status === 'ready')).toBe(true);
    expect(h.replies).not.toContainEqual(expect.objectContaining({ snapshot: expect.objectContaining({ revision: 2 }) }));
    h.observer.dispose();
  });
  it.each([[1, 1], [0, 2]])('immediately drops data on context change %s/%s and rejects wrong-context replies', async (generation, epoch) => {
    const h = setup(); await h.observer.resume();
    const pending = held<unknown>();
    h.send.mockImplementationOnce(async (request) => {
      await pending.promise;
      return { protocolVersion: 1, requestId: request.requestId, operation: request.operation, ok: true, result: snapshot(2) };
    });
    h.notify(2, generation, epoch);
    expect(h.replies.at(-1)).toEqual({ status: 'loading' });
    pending.resolve(null);
    await vi.waitFor(() => expect(h.replies.at(-1)).toMatchObject({ status: 'unavailable', error: { code: 'data-unavailable' } }));
    expect(h.replies.filter((state) => state.status === 'ready')).toHaveLength(1);
    h.observer.dispose();
  });
  it('accepts a newer authoritative context when its revision hint was dropped', async () => {
    const h = setup(); await h.observer.resume();
    const next = { ...snapshot(2), dataGeneration: 1, authEpoch: 2, owner: null, videos: [], sync: null };
    h.send.mockImplementation(async (request) => ({ protocolVersion: 1, requestId: request.requestId,
      operation: request.operation, ok: true, result: next }));
    await h.observer.resume();
    expect(h.replies.at(-1)).toEqual({ status: 'ready', snapshot: next }); h.observer.dispose();
  });
  it('an authoritative auth failure invalidates data and fences a held library success', async () => {
    const h = setup(); await h.observer.resume();
    const pending = held<unknown>();
    h.send.mockImplementationOnce(async (request) => {
      await pending.promise;
      return { protocolVersion: 1, requestId: request.requestId, operation: request.operation, ok: true, result: snapshot(2) };
    });
    const reading = h.observer.refresh();
    h.observer.invalidate({ code: 'data-unavailable', detail: null, cleanup: null });
    pending.resolve(null); await reading;
    expect(h.replies.at(-1)).toMatchObject({ status: 'unavailable' });
    expect(h.replies.filter((state) => state.status === 'ready')).toHaveLength(1);
    h.observer.dispose();
  });
  it('auth control truth closes a changed context even when its broadcast was dropped', async () => {
    const h = setup(); await h.observer.resume();
    const pending = held<unknown>();
    h.send.mockImplementationOnce(async (request) => {
      await pending.promise;
      return { protocolVersion: 1, requestId: request.requestId, operation: request.operation, ok: true, result: snapshot(1) };
    }).mockReturnValue(new Promise(() => {}));
    const reading = h.observer.refresh();
    h.observer.observeRevision({ revision: 2, dataGeneration: 1, authEpoch: 1 });
    expect(h.replies.at(-1)).toEqual({ status: 'loading' });
    pending.resolve(null); await reading;
    expect(h.replies.filter((state) => state.status === 'ready')).toHaveLength(1);
    h.observer.dispose();
  });
  it('keeps its deadline timer armed while rejecting an old reply from a revision burst', async () => {
    const h = setup(); await h.observer.resume();
    const pending = held<unknown>();
    h.send.mockImplementationOnce(async (request) => ({ protocolVersion: 1, requestId: request.requestId,
      operation: request.operation, ok: true, result: snapshot(1) })).mockReturnValue(pending.promise);
    h.notify(3);
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledTimes(3));
    h.setNow('2026-10-05T12:00:00.000Z'); h.fire();
    expect(h.replies.at(-1)).toMatchObject({ status: 'unavailable', error: { code: 'data-unavailable' } });
    h.observer.dispose(); pending.resolve(null);
  });
  it('discards cached data synchronously on resume past expiry, even with dropped notifications', async () => {
    const h = setup(); await h.observer.resume();
    expect(h.replies.at(-1)).toMatchObject({ status: 'ready' });
    const pending = held<unknown>(); h.send.mockReturnValue(pending.promise);
    h.setNow('2026-10-05T12:00:00.000Z');
    const refresh = h.observer.resume();
    expect(h.replies.at(-1)).toMatchObject({ status: 'unavailable', error: { code: 'data-unavailable' } });
    pending.resolve(null); await refresh; h.observer.dispose();
  });
  it('active surface timer hides data at its valid-until boundary before its next response', async () => {
    const h = setup(); await h.observer.resume();
    const pending = held<unknown>(); h.send.mockReturnValue(pending.promise);
    h.setNow('2026-10-05T12:00:00.000Z'); h.fire();
    expect(h.replies.at(-1)).toMatchObject({ status: 'unavailable' });
    pending.resolve(null); await vi.waitFor(() => expect(h.replies.at(-1)).toMatchObject({ error: { code: 'protocol-error' } }));
    h.observer.dispose();
  });
  it('expired successful reply cannot repopulate a view', async () => {
    const h = setup(); h.setNow('2026-10-05T12:00:00.000Z');
    await h.observer.resume();
    expect(h.replies).not.toContainEqual(expect.objectContaining({ status: 'ready' }));
    expect(h.replies.at(-1)).toMatchObject({ status: 'unavailable' }); h.observer.dispose();
  });
  it('serializes reads, refetches after notification gaps and rejects an older in-flight reply', async () => {
    const h = setup();
    const pending = held<unknown>();
    h.send.mockImplementationOnce(async (request) => {
      await pending.promise;
      return { protocolVersion: 1, requestId: request.requestId, operation: request.operation, ok: true, result: snapshot(1) };
    }).mockImplementation(async (request) => ({ protocolVersion: 1, requestId: request.requestId,
      operation: request.operation, ok: true, result: snapshot(10) }));
    const first = h.observer.refresh(); h.notify(10); h.notify(5);
    expect(h.send).toHaveBeenCalledTimes(1);
    pending.resolve(null); await first;
    await vi.waitFor(() => expect(h.replies.at(-1)).toMatchObject({ status: 'ready', snapshot: { revision: 10 } }));
    expect(h.replies).not.toContainEqual(expect.objectContaining({ snapshot: expect.objectContaining({ revision: 1 }) }));
    expect(h.send).toHaveBeenCalledTimes(2); h.observer.dispose();
  });
  it('a backward surface clock discards cached data and cannot accept a delayed success', async () => {
    const h = setup(); await h.observer.resume();
    h.setNow('2026-10-03T12:00:00.000Z');
    const refresh = h.observer.resume();
    expect(h.replies.at(-1)).toMatchObject({ status: 'unavailable' });
    await refresh;
    expect(h.replies.at(-1)).toMatchObject({ status: 'unavailable' }); h.observer.dispose();
  });
  it('lost runtime transport clears cached view without inventing an empty library', async () => {
    const h = setup(); await h.observer.resume(); h.send.mockRejectedValue(new Error('port closed'));
    await h.observer.refresh();
    expect(h.replies.at(-1)).toMatchObject({ status: 'unavailable', error: { code: 'transport-error' } }); h.observer.dispose();
  });
  it('active attempt schedules observation every two seconds independently of notifications', async () => {
    const data = snapshot(); data.sync = { currentAttempt: attempt(), previousCompletedResult: null, latestSuccessfulSync: null,
      lastMirrorChangeRevision: 0, lastFinalizedMirrorRevision: null };
    const h = setup(data); await h.observer.resume();
    expect(h.schedule.mock.calls[0]![1]).toBe(2000); h.observer.dispose();
  });
  it('dispose drops a delayed reply and detaches revision subscription', async () => {
    const h = setup(); const pending = held<unknown>(); h.send.mockReturnValue(pending.promise);
    const refresh = h.observer.refresh(); h.observer.dispose(); pending.resolve(null); await refresh; h.notify(10);
    expect(h.replies).toEqual([]); expect(h.send).toHaveBeenCalledTimes(1);
  });
});
