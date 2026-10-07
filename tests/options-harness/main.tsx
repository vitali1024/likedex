// Explicit separately built browser component composition. Never imported by
// entrypoints/ or src/. SYNC_START reaches the actual production background;
// its real storage is disconnected despite the Options-only fixture identity.
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { OptionsApp } from '../../src/options/OptionsApp';
import type { SyncAttempt } from '../../src/domain/contracts';
import '../../src/options/options.css';
import { RuntimeClient } from '../../src/runtime/client';
import { failure, type RuntimeOperation } from '../../src/runtime/contracts';
import { channelPickerVideos, optionsAuth, optionsSnapshot } from '../fixtures/options';
import { attempt, NEXT_ATTEMPT_ID, OBSERVED } from '../fixtures/storage';

export interface OptionsTestControl {
  calls: RuntimeOperation[];
  change(mode: string, count?: number): void;
  holdReads(operations?: RuntimeOperation[]): void;
  releaseReads(operations?: RuntimeOperation[]): void;
  renderedStates: { header: boolean; oldStatus: boolean; rows: boolean; checking: boolean; unavailable: boolean }[];
  pendingReads(): number;
  progress(page: number, phase: 'scanning' | 'applying'): void;
  checkpoint(values: Partial<SyncAttempt>): void;
  invalidate(boundary: 'generation' | 'epoch', broadcast?: boolean): void;
}
let mode = new URL(location.href).searchParams.get('mode') ?? 'library';
let snapshot = optionsSnapshot();
const pickerVideos = channelPickerVideos();
let revision = 1;
const listeners = new Set<(event: unknown) => void>();
const calls: RuntimeOperation[] = [];
let pending: { operation: RuntimeOperation; resolve(): void }[] = [];
let holding = new Set<RuntimeOperation>();
const notify = () => listeners.forEach((listener) => listener({ protocolVersion: 1, event: 'STATE_REVISION',
  revision: snapshot.revision = ++revision, dataGeneration: snapshot.dataGeneration, authEpoch: snapshot.authEpoch }));
const renderedStates: OptionsTestControl['renderedStates'] = [];
const control: OptionsTestControl = { calls, renderedStates, change(next, count) {
  mode = next;
  if (count !== undefined) snapshot = optionsSnapshot(count);
  notify();
}, holdReads(operations = ['AUTH_STATUS_GET', 'LIBRARY_SNAPSHOT_GET']) { holding = new Set(operations); }, releaseReads(operations) {
  const released = operations ?? [...holding]; released.forEach((operation) => holding.delete(operation));
  const waiting = pending.filter((item) => released.includes(item.operation));
  pending = pending.filter((item) => !released.includes(item.operation)); waiting.forEach((item) => item.resolve());
}, pendingReads() { return pending.length; }, progress(page, phase) {
  mode = 'progress';
  snapshot.sync!.currentAttempt = attempt({ attemptId: NEXT_ATTEMPT_ID, state: phase, pagesAccepted: page, rawItems: page * 50,
    uniqueMembership: page * 50, safeCommits: page, authEpoch: snapshot.authEpoch, dataGeneration: snapshot.dataGeneration });
  notify();
}, checkpoint(values) {
  mode = 'progress';
  snapshot.sync!.currentAttempt = attempt({ attemptId: NEXT_ATTEMPT_ID,
    ...snapshot.sync!.currentAttempt, ...values, authEpoch: snapshot.authEpoch, dataGeneration: snapshot.dataGeneration });
  snapshot.sync!.lastMirrorChangeRevision = revision + 1;
  if (values.state === 'success') {
    snapshot.sync!.latestSuccessfulSync = { ...snapshot.sync!.latestSuccessfulSync!, attemptId: snapshot.sync!.currentAttempt.attemptId,
      localMembershipCount: snapshot.videos.length, completedAt: values.finishedAt ?? OBSERVED };
    snapshot.sync!.lastFinalizedMirrorRevision = revision + 1;
  }
  notify();
}, invalidate(boundary, broadcast = true) {
  if (boundary === 'generation') snapshot.dataGeneration++;
  else snapshot.authEpoch++;
  mode = 'connected-empty'; snapshot.owner = null; snapshot.videos = []; snapshot.sync = null;
  if (broadcast) notify(); else snapshot.revision = ++revision;
} };
(window as unknown as { optionsTest: OptionsTestControl }).optionsTest = control;
if (mode === 'bootstrap') control.holdReads();
const client = new RuntimeClient({
  subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async send(request) {
    calls.push(request.operation);
    if (holding.has(request.operation)) {
      await new Promise<void>((resolve) => pending.push({ operation: request.operation, resolve }));
    }
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
      auth.control.dataGeneration = snapshot.dataGeneration;
      auth.control.authEpoch = snapshot.authEpoch;
      const { control: ignored, ...result } = auth; void ignored;
      return response(result);
    }
    if (request.operation === 'AUTH_STATUS_GET') {
      if (mode === 'auth-error') return rejected('transport-error');
      const auth = optionsAuth();
      if (mode === 'unknown-title' && auth.status === 'authorized') delete auth.bootstrap.channelTitle;
      if (mode === 'long-title' && auth.status === 'authorized') auth.bootstrap.channelTitle = `Very long channel ${'name '.repeat(35)}`;
      auth.control.revision = revision;
      auth.control.dataGeneration = snapshot.dataGeneration;
      auth.control.authEpoch = snapshot.authEpoch;
      if (mode === 'auth-pending') return response({ status: 'validation-pending', control: auth.control });
      if (mode === 'disconnected' || mode === 'connect-failure') return response({ status: 'auth-required', control: { ...auth.control, connectionGate: 'disconnected' } });
      if (mode === 'mismatch') return response({ status: 'owner-mismatch', control: auth.control,
        bootstrap: { channelId: 'owner-b', channelTitle: 'Different channel', likesPlaylistId: 'likes-owner-b' }, localOwnerChannelId: 'owner-a' });
      return response(auth);
    }
    if (request.operation === 'LIBRARY_SNAPSHOT_GET') {
      if (mode === 'thumbnail-cases') return response({ ...snapshot, videos: snapshot.videos.map((video) => ({ ...video,
        thumbnailUrl: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
        metadataFreshness: { ...video.metadataFreshness, thumbnailUrl: video.membershipFreshness },
      })) });
      if (mode === 'channel-cases') return response({ ...snapshot, videos: pickerVideos });
      if (mode === 'snapshot-error') return rejected('storage-error');
      if (mode === 'mismatch') return rejected('auth-error', { category: 'owner-mismatch', messageKey: 'owner-mismatch', phase: 'preparing' });
      if (mode === 'loading') await new Promise(() => {});
      if (mode === 'disconnected' || mode === 'connect-failure' || mode === 'connected-empty') return response({ ...snapshot, owner: null, videos: [], sync: null });
      if (mode === 'active') return response({ ...snapshot, sync: { ...snapshot.sync!, currentAttempt: attempt({ attemptId: NEXT_ATTEMPT_ID, pagesAccepted: 2, rawItems: 60, uniqueMembership: 60 }) } });
      if (mode === 'later-failure') return response({ ...snapshot, sync: { ...snapshot.sync!, currentAttempt: attempt({ attemptId: NEXT_ATTEMPT_ID, state: 'failure', finishedAt: OBSERVED,
        error: { category: 'network', messageKey: 'network-failed', phase: 'scanning' } }) } });
      return response(snapshot);
    }
    return rejected('invalid-request');
  },
});
const root = document.getElementById('root');
if (!root) throw new Error('Test composition root missing');
new MutationObserver(() => {
  const header = document.querySelector('.app-header');
  renderedStates.push({ header: Boolean(header), oldStatus: Boolean(document.querySelector('.status-rail, .status-overview, main > .connection:not(:has([role="alert"]))')),
    rows: Boolean(document.querySelector('.video-row')), checking: /Checking (connection|YouTube authorization)/.test(header?.textContent ?? ''),
    unavailable: Boolean(document.querySelector('.empty.error')) });
}).observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
createRoot(root).render(<OptionsApp client={client} surface={new URL(location.href).searchParams.get('surface') === 'sidepanel' ? 'sidepanel' : 'options'} />);
