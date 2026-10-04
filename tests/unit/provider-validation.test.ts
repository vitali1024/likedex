import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeIdentityAdapter } from '@/src/auth/chrome-identity';
import { GoogleAuthorizationRequests, type FetchBoundary } from '@/src/auth/google-requests';
import { LikedexDatabase } from '@/src/storage/database';
import { LibraryRepository } from '@/src/storage/repository';
import { PRODUCTION_PROVIDER_VALIDATION_APPROVED } from '@/src/runtime/background';
import { YouTubeLikedVideosProvider, isTrustedProviderCompletion } from '@/src/provider/youtube-ingestion';
import { observeProvider } from '@/tools/provider-validation/service';
import { validationSenderAllowed } from '@/tools/provider-validation/background';
import { resultSchema, startSchema, type ValidationSummary } from '@/tools/provider-validation/contracts';
import { NOW, OBSERVED, attempt, owner, success, video } from '../fixtures/storage';
import { TOKEN_A, channelResponse, chromeIdentity, held, json, timing } from '../fixtures/authentication';
import { member, membershipPage, metadata, videoId, videosPage } from '../fixtures/provider';

let db: LikedexDatabase;
let repository: LibraryRepository;
let before: unknown;
const writes: ReturnType<typeof vi.spyOn>[] = [];
async function raw() { return Promise.all(db.tables.map(async (table) => ({ name: table.name, rows: await table.toArray() }))); }
beforeEach(async () => {
  db = new LikedexDatabase('likedex', { indexedDB: new IDBFactory(), IDBKeyRange });
  repository = new LibraryRepository(db);
  await repository.initialize();
  let snapshot = await repository.readSnapshot(OBSERVED);
  snapshot = await repository.saveConnectionState({ connectionGate: 'connected', authorizationCheckDueAt: '2026-10-05T12:00:00.000Z' }, snapshot.fence, OBSERVED);
  snapshot = await repository.saveOwner(owner(), snapshot.fence, OBSERVED);
  snapshot = await repository.saveCurrentAttempt(attempt({ authEpoch: snapshot.control.authEpoch }), snapshot.fence, OBSERVED);
  snapshot = await repository.upsertVideos([video(), video('unrelated-membership')], snapshot.fence, OBSERVED);
  snapshot = await repository.saveCurrentAttempt(attempt({ state: 'success', finishedAt: OBSERVED, authEpoch: snapshot.control.authEpoch }), snapshot.fence, OBSERVED);
  await repository.saveLatestSuccessfulSync(success(), snapshot.fence, OBSERVED);
  before = await raw();
  // A genuine trusted-empty run below must leave these unrelated rows intact.
  writes.push(vi.spyOn(repository, 'finalizeTrustedEnumeration'), vi.spyOn(repository, 'applyProviderPage'),
    vi.spyOn(repository, 'claimSyncAttempt'), vi.spyOn(repository, 'saveConnectionState'),
    vi.spyOn(repository, 'recordAuthorizationCheck'), vi.spyOn(repository, 'beginCleanup'), vi.spyOn(repository, 'finishCleanup'));
});
afterEach(async () => {
  expect(await raw()).toEqual(before); // Owner, videos, sync, freshness AND control bookkeeping.
  for (const spy of writes.splice(0)) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  await db.delete();
});
function setup(bodies: unknown[] = [channelResponse(), membershipPage(), videosPage()]) {
  const chrome = chromeIdentity();
  const fetcher = vi.fn<FetchBoundary>();
  bodies.forEach((body) => fetcher.mockImplementationOnce(async () => json(body)));
  const requests = new GoogleAuthorizationRequests(new ChromeIdentityAdapter(chrome), fetcher, timing());
  const abort = new AbortController();
  const progress: ValidationSummary[] = [];
  const run = () => observeProvider(requests, () => repository.readObservationSnapshot(NOW), abort.signal,
    (summary) => progress.push(summary), () => NOW, () => '00000000-0000-4000-8000-000000000090');
  return { chrome, fetcher, requests, abort, progress, run };
}
describe('Human release observation is non-destructive', () => {
  it('returns safe bootstrap failure diagnostics without acquiring mutation capabilities', async () => {
    const scan = setup([]);
    scan.fetcher.mockRejectedValue(new TypeError(`Illegal invocation ${TOKEN_A} secret body`));
    const result = await scan.run();
    expect(result).toMatchObject({ status: 'failed', summary: { trustedCompletion: false, pages: 0 },
      diagnostic: { phase: 'bootstrap-fetch', endpoint: 'youtube.channels.list', httpStatus: null,
        errorCode: 'fetch-invocation', retryOccurred: false } });
    expect(scan.fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain(TOKEN_A);
    expect(JSON.stringify(result)).not.toContain('secret body');
    expect(resultSchema.safeParse({ ...result, diagnostic: { phase: 'bootstrap-fetch', endpoint: 'youtube.channels.list',
      httpStatus: null, errorCode: 'fetch-invocation', retryOccurred: false, token: TOKEN_A } }).success).toBe(false);
  });
  it('consumes authentic provider completion and returns only sanitized aggregates without applying pages', async () => {
    const seenProofs: unknown[] = [];
    const original = YouTubeLikedVideosProvider.prototype.enumerateLikedVideos;
    vi.spyOn(YouTubeLikedVideosProvider.prototype, 'enumerateLikedVideos').mockImplementation(async function* (this: YouTubeLikedVideosProvider, ...args) {
      for await (const event of original.apply(this, args)) {
        if (event.kind === 'trusted-complete') seenProofs.push(event);
        yield event;
      }
    });
    const scan = setup();
    const result = await scan.run();
    expect(result).toEqual({ status: 'success', summary: {
      mode: 'observation-only', productionSyncGate: 'closed', bootstrapValidated: true, trustedCompletion: true,
      pages: 1, rawMemberships: 1, uniqueMemberships: 1, duplicateVideoItems: 0, estimatedTotal: 1,
      hydrationPages: 1, hydrated: 1, lookupOmitted: 0, withoutRichMetadata: 0, unavailable: 0, unknownAvailability: 0,
    } });
    expect(seenProofs).toHaveLength(1);
    expect(isTrustedProviderCompletion(seenProofs[0])).toBe(true);
    const evidence = JSON.stringify({ result, progress: scan.progress });
    for (const forbidden of [TOKEN_A, 'owner-a', 'likes-owner-a', videoId(), 'Video 1', 'source-1', 'membershipVideoIds', 'scope']) {
      expect(evidence).not.toContain(forbidden);
    }
    expect(scan.chrome.getAuthToken.mock.calls.every(([args]) => args?.interactive === false)).toBe(true);
    expect(resultSchema.safeParse(result).success).toBe(true);
  });
  it('trusted empty cannot prune seeded unrelated membership or replace latest success', async () => {
    const scan = setup([channelResponse(), membershipPage([])]);
    expect(await scan.run()).toMatchObject({ status: 'success', summary: { trustedCompletion: true, uniqueMemberships: 0, hydrationPages: 0 } });
    expect(scan.fetcher).toHaveBeenCalledTimes(2);
  });
  it('follows real-provider opaque continuation and distinguishes raw duplicates from unique membership', async () => {
    const scan = setup([channelResponse(), membershipPage([member()], 'opaque-private-token', 3), videosPage(),
      membershipPage([member(2, videoId(1)), member(3)], undefined, 3), videosPage([metadata(1), metadata(3)])]);
    const result = await scan.run();
    expect(result).toMatchObject({ status: 'success', summary: { pages: 2, rawMemberships: 3, uniqueMemberships: 2, duplicateVideoItems: 1, hydrated: 2 } });
    expect(new URL(scan.fetcher.mock.calls[3]![0]).searchParams.get('pageToken')).toBe('opaque-private-token');
    expect(JSON.stringify(result)).not.toContain('opaque-private-token');
  });
  it('keeps lookup-omitted and private membership honestly separate from rich hydration', async () => {
    const privateVideo = metadata(2); privateVideo.status.privacyStatus = 'private';
    const scan = setup([channelResponse(), membershipPage([member(1), member(2), member(3)]), videosPage([metadata(1), privateVideo])]);
    expect(await scan.run()).toMatchObject({ status: 'success', summary: { uniqueMemberships: 3, hydrated: 2,
      lookupOmitted: 1, withoutRichMetadata: 1, unavailable: 1, unknownAvailability: 1 } });
  });
  it.each([{}, { kind: 'youtube#channelListResponse', items: [] }, { ...channelResponse(), items: [{ kind: 'youtube#channel', id: 'owner-a' }] }])('malformed or absent bootstrap fails before enumeration: %j', async (body) => {
    const scan = setup([body]);
    expect(await scan.run()).toMatchObject({ status: 'failed', summary: { trustedCompletion: false, bootstrapValidated: false, pages: 0 } });
    expect(scan.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { kind: 'youtube#playlistItemListResponse', pageInfo: { totalResults: 0, resultsPerPage: 0 } },
    membershipPage([{ ...member(), contentDetails: {}, snippet: {} } as ReturnType<typeof member>])])('malformed provider page fails closed: %j', async (body) => {
    expect(await setup([channelResponse(), body]).run()).toMatchObject({ status: 'failed', summary: { trustedCompletion: false, pages: 0 } });
  });
  it('partial enumeration preserves aggregate progress but never claims success', async () => {
    const scan = setup([channelResponse(), membershipPage([member()], 'next-secret', 2), videosPage(), { items: [] }]);
    expect(await scan.run()).toMatchObject({ status: 'failed', summary: { trustedCompletion: false, pages: 1, uniqueMemberships: 1 } });
    expect(scan.progress.every((summary) => !summary.trustedCompletion)).toBe(true);
  });
  it('hydration transport failure does not treat membership as a successful empty scan', async () => {
    const scan = setup([channelResponse(), membershipPage()]);
    scan.fetcher.mockRejectedValue(new TypeError(`raw body ${TOKEN_A}`));
    const result = await scan.run();
    expect(result).toMatchObject({ status: 'failed', summary: { trustedCompletion: false }, error: { category: 'network' } });
    expect(JSON.stringify(result)).not.toContain(TOKEN_A);
  });
  it('cancellation after terminal page prevents trusted success', async () => {
    const scan = setup();
    const result = await observeProvider(scan.requests, () => repository.readObservationSnapshot(NOW), scan.abort.signal,
      () => scan.abort.abort(), () => NOW);
    expect(result).toMatchObject({ status: 'failed', summary: { trustedCompletion: false, pages: 1 }, error: { category: 'interrupted' } });
  });
  it('fabricated or copied completion is never accepted', async () => {
    const original = YouTubeLikedVideosProvider.prototype.enumerateLikedVideos;
    vi.spyOn(YouTubeLikedVideosProvider.prototype, 'enumerateLikedVideos').mockImplementation(async function* (this: YouTubeLikedVideosProvider, ...args) {
      for await (const event of original.apply(this, args)) yield event.kind === 'page' ? event : { ...event };
    });
    expect(await setup().run()).toMatchObject({ status: 'failed', summary: { trustedCompletion: false } });
  });
  it('terminal page without a completion capability is not success', async () => {
    const original = YouTubeLikedVideosProvider.prototype.enumerateLikedVideos;
    vi.spyOn(YouTubeLikedVideosProvider.prototype, 'enumerateLikedVideos').mockImplementation(async function* (this: YouTubeLikedVideosProvider, ...args) {
      for await (const event of original.apply(this, args)) { if (event.kind === 'page') yield event; else return; }
    });
    expect(await setup().run()).toMatchObject({ status: 'failed', summary: { trustedCompletion: false, pages: 1 } });
  });
  it('disconnected, overdue, cleanup-pending and active-sync preconditions do not request Google', async () => {
    for (const changes of [{ connectionGate: 'disconnected' as const }, { authorizationCheckDueAt: NOW },
      { pendingCleanupReason: 'disconnect' as const }]) {
      const snapshot = await repository.readObservationSnapshot(NOW);
      const scan = setup();
      const result = await observeProvider(scan.requests, async () => ({ ...snapshot, control: { ...snapshot.control, ...changes } }), scan.abort.signal, undefined, () => NOW);
      expect(result.status).toBe('failed'); expect(scan.fetcher).not.toHaveBeenCalled();
    }
    const snapshot = await repository.readObservationSnapshot(NOW);
    const scan = setup();
    expect((await observeProvider(scan.requests, async () => ({ ...snapshot, sync: { ...snapshot.sync!, currentAttempt: attempt() } }), scan.abort.signal)).status).toBe('failed');
    expect(scan.fetcher).not.toHaveBeenCalled();
  });
  it('a changed fence during held bootstrap stops before membership access and reveals no identifiers', async () => {
    const scan = setup([]); const pending = held<Response>(); scan.fetcher.mockReturnValueOnce(pending.promise);
    const snapshot = await repository.readObservationSnapshot(NOW); let changed = false;
    const run = observeProvider(scan.requests, async () => ({ ...snapshot, control: { ...snapshot.control, authEpoch: snapshot.control.authEpoch + Number(changed) } }), scan.abort.signal, undefined, () => NOW);
    await vi.waitFor(() => expect(scan.fetcher).toHaveBeenCalledTimes(1));
    changed = true; pending.resolve(json());
    expect(await run).toMatchObject({ status: 'failed', summary: { trustedCompletion: false, pages: 0 } });
    expect(scan.fetcher).toHaveBeenCalledTimes(1);
  });
  it('owner mismatch observes no memberships and binds/replaces nothing', async () => {
    const body = channelResponse(); body.items[0]!.id = 'different-owner';
    const scan = setup([body]);
    expect(await scan.run()).toMatchObject({ status: 'failed', error: { category: 'owner-mismatch' } });
    expect(scan.fetcher).toHaveBeenCalledTimes(1);
  });
  it('read/identity failures containing a token become only fixed sanitized failures', async () => {
    const scan = setup(); scan.chrome.getAuthToken.mockRejectedValue(new Error(`raw failure ${TOKEN_A}`));
    expect(JSON.stringify(await scan.run())).not.toContain(TOKEN_A);
    const result = await observeProvider(scan.requests, async () => { throw new Error(TOKEN_A); }, scan.abort.signal);
    expect(result).toMatchObject({ status: 'failed', error: { category: 'internal' } });
    expect(JSON.stringify(result)).not.toContain(TOKEN_A);
  });
  it('production approval remains false and release protocol accepts no bypass parameters', () => {
    expect(PRODUCTION_PROVIDER_VALIDATION_APPROVED).toBe(false);
    expect(startSchema.safeParse({ operation: 'OBSERVE_PROVIDER', providerValidationApproved: true }).success).toBe(false);
    const id = 'mmefiakgfhddiojfdnkfpfpbkgbfgkgj';
    expect(validationSenderAllowed({ id, url: `chrome-extension://${id}/provider-validation.html` }, id)).toBe(true);
    expect(validationSenderAllowed({ id, url: `chrome-extension://${id}/provider-validation.html`, tab: {} }, id)).toBe(true);
    for (const sender of [undefined, { id, url: `chrome-extension://${id}/options.html` }, { id: 'other', url: 'https://example.com' },
      { id, url: 'https://www.youtube.com/', tab: {} }]) expect(validationSenderAllowed(sender, id)).toBe(false);
  });
});

