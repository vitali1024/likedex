import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { ChromeIdentityAdapter } from '@/src/auth/chrome-identity';
import { GoogleAuthorizationRequests } from '@/src/auth/google-requests';
import type { RequestTiming } from '@/src/auth/google-requests';
import { YouTubeLikedVideosProvider, isTrustedProviderCompletion, type ProviderEvent, type ProviderPage } from '@/src/provider/youtube-ingestion';
import { canonicalTimestamp, durationSeconds, validateMembershipPage } from '@/src/provider/youtube-schemas';
import { videoSchema } from '@/src/domain/contracts';
import { TOKEN_A, TOKEN_B, bootstrap, channelResponse, chromeIdentity, held, json, timing } from '../fixtures/authentication';
import { context, member, membershipPage, metadata, videoId, videosPage, generatedLikesPages, invalidMembershipCases, UNKNOWN_PLAYLIST_PRIVACY_STATUS } from '../fixtures/provider';
import type { MembershipItemDiagnostic } from '@/src/provider/diagnostics';

function setup(bodies: unknown[] = [membershipPage(), videosPage()]) {
  const chrome = chromeIdentity();
  const fetcher = vi.fn<(...args: [string, RequestInit]) => Promise<Response>>();
  bodies.forEach((body) => fetcher.mockResolvedValueOnce(json(body)));
  const clock = timing();
  const requests = new GoogleAuthorizationRequests(new ChromeIdentityAdapter(chrome), fetcher, clock);
  const provider = new YouTubeLikedVideosProvider(requests);
  const abort = new AbortController();
  const events: ProviderEvent[] = [];
  const run = async () => { for await (const event of provider.enumerateLikedVideos(context, abort.signal)) events.push(event); return events; };
  return { chrome, fetcher, clock, requests, provider, abort, events, run };
}
function pages(events: ProviderEvent[]): ProviderPage[] { return events.filter((event) => event.kind === 'page'); }
async function rejectsWithoutCompletion(body: unknown, code?: string) {
  const scan = setup([body]);
  await expect(scan.run()).rejects.toMatchObject(code ? { code } : { detail: expect.any(Object) });
  expect(scan.events.some(isTrustedProviderCompletion)).toBe(false);
  expect(scan.fetcher).toHaveBeenCalledTimes(1);
  return scan;
}

afterEach(() => vi.useRealTimers());

describe('Provider request shape and streaming (AC-RECON-005/006)', () => {
  it('accepts the otherwise valid page-eight unknown privacy member, hydrates it and continues to page nine', async () => {
    const generated = generatedLikesPages(450);
    const scan = setup(generated.flatMap((page) => [page.membership, page.hydration]));
    const events = await scan.run();
    const eighth = pages(events)[7]!;
    expect(eighth).toMatchObject({ pageNumber: 8, terminal: false, progress: { rawItems: 400 } });
    expect(eighth.records[16]).toMatchObject({ videoId: videoId(367), membershipSourceIds: ['source-367'],
      likedAt: '2026-09-01T10:00:00.000Z', availability: { state: 'available', evidence: 'public' } });
    expect(new URL(scan.fetcher.mock.calls[15]![0]).searchParams.get('id')?.split(',')).toContain(videoId(367));
    expect(pages(events)[8]).toMatchObject({ pageNumber: 9, terminal: true });
    expect(new URL(scan.fetcher.mock.calls[16]![0]).searchParams.get('pageToken')).toBe(generated[7]!.next);
    expect(scan.fetcher).toHaveBeenCalledTimes(18);
    expect(isTrustedProviderCompletion(events.at(-1))).toBe(true);
    expect(events.at(-1)).toMatchObject({ progress: { pagesAccepted: 9, rawItems: 450, uniqueMembership: 450, estimatedTotal: 450 } });
    expect(JSON.stringify(events)).not.toContain(UNKNOWN_PLAYLIST_PRIVACY_STATUS);
  });
  it('traverses 3547 memberships / 71 pages including unknown page-eight privacy with terminal-only trust', async () => {
    const generated = generatedLikesPages();
    expect(generated[7]!.membership.items[16]).toMatchObject({ status: { privacyStatus: UNKNOWN_PLAYLIST_PRIVACY_STATUS } });
    const scan = setup(generated.flatMap((page) => [page.membership, page.hydration]));
    const iterator = scan.provider.enumerateLikedVideos(context, scan.abort.signal);
    for (const [index, fixture] of generated.entries()) {
      const event = (await iterator.next()).value!;
      expect(event).toMatchObject({ kind: 'page', pageNumber: index + 1,
        terminal: index === 70, progress: { rawItems: Math.min((index + 1) * 50, 3547) } });
      expect(isTrustedProviderCompletion(event)).toBe(false);
      if (index === 7) {
        expect(event).toMatchObject({ records: expect.arrayContaining([expect.objectContaining({
          videoId: videoId(367), membershipSourceIds: ['source-367'], likedAt: '2026-09-01T10:00:00.000Z',
          availability: { state: 'available', evidence: 'public' },
        })]) });
        expect(JSON.stringify(event)).not.toContain(UNKNOWN_PLAYLIST_PRIVACY_STATUS);
      }
      expect(scan.fetcher).toHaveBeenCalledTimes((index + 1) * 2);
      const membershipUrl = new URL(scan.fetcher.mock.calls[index * 2]![0]);
      expect(membershipUrl.searchParams.get('pageToken')).toBe(index === 0 ? null : generated[index - 1]!.next);
      expect(membershipUrl.searchParams.get('maxResults')).toBe('50');
      const hydrationUrl = new URL(scan.fetcher.mock.calls[index * 2 + 1]![0]);
      expect(hydrationUrl.pathname).toBe('/youtube/v3/videos');
      expect(hydrationUrl.searchParams.get('id')?.split(',')).toEqual(fixture.hydration.items.map((item) => item.id));
      expect(hydrationUrl.searchParams.has('pageToken')).toBe(false);
    }
    const completion = (await iterator.next()).value!;
    expect(isTrustedProviderCompletion(completion)).toBe(true);
    expect(completion).toMatchObject({ kind: 'trusted-complete', progress: {
      pagesAccepted: 71, rawItems: 3547, uniqueMembership: 3547, duplicateVideoItems: 0, estimatedTotal: 3547 } });
    if (completion.kind === 'trusted-complete') {
      expect(completion.membershipVideoIds).toHaveLength(3547);
      expect(completion.pageChain).toHaveLength(71);
    }
    expect((await iterator.next()).done).toBe(true);
    expect(scan.clock.sleep).not.toHaveBeenCalled();
  });
  it('uses authoritative Likes ID and exact GET parts, batches and maps the existing domain', async () => {
    const scan = setup();
    expect(scan.fetcher).not.toHaveBeenCalled();
    const events = await scan.run();
    expect(events.map((event) => event.kind)).toEqual(['page', 'trusted-complete']);
    const [playlistCall, videosCall] = scan.fetcher.mock.calls;
    const playlistUrl = new URL(playlistCall![0]);
    expect(playlistUrl.origin + playlistUrl.pathname).toBe('https://www.googleapis.com/youtube/v3/playlistItems');
    expect([...playlistUrl.searchParams]).toEqual([['part', 'id,snippet,contentDetails,status'], ['maxResults', '50'], ['playlistId', bootstrap.likesPlaylistId]]);
    const videosUrl = new URL(videosCall![0]);
    expect(videosUrl.origin + videosUrl.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');
    expect([...videosUrl.searchParams]).toEqual([['part', 'snippet,contentDetails,status'], ['id', videoId()]]);
    for (const [, init] of scan.fetcher.mock.calls) expect(init).toMatchObject({ method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN_A}` }, redirect: 'error', credentials: 'omit', cache: 'no-store' });
    const record = pages(events)[0]!.records[0]!;
    expect(videoSchema.safeParse(record).success).toBe(true);
    expect(record).toMatchObject({ videoId: videoId(), ownerChannelId: bootstrap.channelId,
      membershipSourceIds: ['source-1'], lastSeenAttemptId: context.attemptId, title: 'Video 1',
      channelId: 'creator-a', likedAt: '2026-09-01T10:00:00.000Z', publishedAt: '2020-01-01T00:00:00.000Z',
      durationSeconds: 245, availability: { state: 'available', evidence: 'public' },
      metadataFetchedAt: '2026-10-04T12:00:00.000Z' });
    expect(record.membershipFreshness).toEqual({ observedAt: '2026-10-04T12:00:00.000Z', expiresAt: '2026-11-03T00:00:00.000Z' });
    expect(JSON.stringify(events)).not.toContain(TOKEN_A);
    expect(scan.chrome.getAuthToken.mock.calls.every(([args]) => args?.interactive === false)).toBe(true);
  });
  it('B: valid explicit empty with zero total yields trusted empty and skips hydration', async () => {
    const scan = setup([membershipPage([])]);
    const events = await scan.run();
    expect(pages(events)[0]!.records).toEqual([]);
    expect(events.at(-1)).toMatchObject({ kind: 'trusted-complete', membershipVideoIds: [],
      progress: { pagesAccepted: 1, rawItems: 0, uniqueMembership: 0, estimatedTotal: 0 } });
    expect(isTrustedProviderCompletion(events.at(-1))).toBe(true);
    expect(scan.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])('follows tokens at the exact 50 boundary (continuation=%s)', async (continuation) => {
    const items = Array.from({ length: 50 }, (_, index) => member(index + 1));
    const metas = Array.from({ length: 50 }, (_, index) => metadata(index + 1));
    const scan = setup([membershipPage(items, continuation ? 'opaque +/=' : undefined, continuation ? 51 : 50),
      videosPage(metas), ...(continuation ? [membershipPage([member(51)], undefined, 51), videosPage([metadata(51)])] : [])]);
    await scan.run();
    expect(scan.events.at(-1)).toMatchObject({ progress: { rawItems: continuation ? 51 : 50, pagesAccepted: continuation ? 2 : 1 } });
    expect(new URL(scan.fetcher.mock.calls[1]![0]).searchParams.get('id')?.split(',')).toHaveLength(50);
    expect(scan.fetcher).toHaveBeenCalledTimes(continuation ? 4 : 2);
    if (continuation) expect(new URL(scan.fetcher.mock.calls[2]![0]).searchParams.get('pageToken')).toBe('opaque +/=');
  });
  it('streams before requesting later pages and does not infer terminal from a short page', async () => {
    const scan = setup([membershipPage([member()], 'next', 2), videosPage(), membershipPage([member(2)], undefined, 2), videosPage([metadata(2)])]);
    const iterator = scan.provider.enumerateLikedVideos(context, scan.abort.signal);
    expect((await iterator.next()).value).toMatchObject({ kind: 'page', progress: { rawItems: 1 } });
    expect(scan.fetcher).toHaveBeenCalledTimes(2);
    expect((await iterator.next()).value).toMatchObject({ kind: 'page', progress: { rawItems: 2 } });
    expect((await iterator.next()).value).toMatchObject({ kind: 'trusted-complete' });
    expect((await iterator.next()).done).toBe(true);
  });
  it('accepts missing nonempty progress total but keeps it null', async () => {
    const scan = setup([membershipPage([member()], undefined, null), videosPage()]);
    expect((await scan.run()).at(-1)).toMatchObject({ kind: 'trusted-complete', progress: { estimatedTotal: null } });
  });
});

describe('Fail-closed membership validation (AC-RECON-003/004/007)', () => {
  it.each(invalidMembershipCases())('diagnostics preserve production rejection for $reason', async ({ item, reason }) => {
    const production = setup([membershipPage([item])]);
    await expect(production.run()).rejects.toMatchObject({ code: 'unmappable-membership', detail: { category: 'untrusted-enumeration' } });
    expect(production.events).toEqual([]);
    const validation = setup([membershipPage([item])]);
    const invalid: MembershipItemDiagnostic[] = [];
    const provider = new YouTubeLikedVideosProvider(validation.requests, undefined, (item) => invalid.push(item));
    const run = async () => { for await (const event of provider.enumerateLikedVideos(context, validation.abort.signal)) validation.events.push(event); };
    await expect(run()).rejects.toMatchObject({ code: 'unmappable-membership', reason });
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ pageOrdinal: 1, itemOrdinal: 1, reasonCodes: [reason] });
    expect(validation.fetcher).toHaveBeenCalledTimes(1);
    expect(validation.events).toEqual([]);
  });
  it.each([
    ['snippet-only identity', { ...member(), contentDetails: {} }],
    ['content-only identity', { ...member(), snippet: { ...member().snippet, resourceId: { kind: 'youtube#video' } } }],
    ['both IDs agree', member()],
    ['no videoPublishedAt or playlist title/thumbnail/channel metadata', { ...member(), status: {} }],
    ['unusable liked date string', { ...member(), snippet: { ...member().snippet, publishedAt: 'private-date-sentinel' } }],
    ['absent liked date and position', { ...member(), snippet: { ...member().snippet, publishedAt: undefined, position: undefined } }],
  ])('retains existing trustworthy membership policy: %s', async (_label, item) => {
    const scan = setup([membershipPage([item]), videosPage()]);
    const invalid: MembershipItemDiagnostic[] = [];
    const provider = new YouTubeLikedVideosProvider(scan.requests, undefined, (item) => invalid.push(item));
    for await (const event of provider.enumerateLikedVideos(context, scan.abort.signal)) scan.events.push(event);
    expect(isTrustedProviderCompletion(scan.events.at(-1))).toBe(true);
    expect(pages(scan.events)[0]!.records[0]!.videoId).toBe(videoId());
    expect(invalid).toEqual([]);
    expect(scan.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([null, [], {}, { kind: 'youtube#playlistItemListResponse' },
    { ...membershipPage([]), items: undefined }, { ...membershipPage([]), items: {} },
    { ...membershipPage([]), kind: 'wrong' }, { ...membershipPage([]), pageInfo: undefined },
    { ...membershipPage([]), pageInfo: { resultsPerPage: -1 } },
    { ...membershipPage([]), pageInfo: { resultsPerPage: 0, totalResults: 1.5 } },
    { ...membershipPage([]), nextPageToken: '' }, { ...membershipPage([]), nextPageToken: null },
    { ...membershipPage([]), nextPageToken: 42 },
  ])('A: malformed HTTP-200 success %# never becomes trusted empty', async (body) => { await rejectsWithoutCompletion(body, 'malformed-response'); });
  it('rejects malformed JSON without retry or completion', async () => {
    const scan = setup([]); scan.fetcher.mockResolvedValueOnce(new Response('{bad json'));
    await expect(scan.run()).rejects.toMatchObject({ code: 'malformed-provider', detail: { category: 'malformed-provider' } });
    expect(scan.events).toEqual([]); expect(scan.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...member(), snippet: undefined }, { ...member(), contentDetails: undefined }, { ...member(), status: undefined },
    { ...member(), id: '' }, { ...member(), kind: 'wrong' },
    { ...member(), snippet: { ...member().snippet, playlistId: 'different' } },
    { ...member(), snippet: { ...member().snippet, resourceId: { kind: 'youtube#channel', videoId: videoId() } } },
    { ...member(), snippet: { ...member().snippet, resourceId: { kind: 'youtube#video' } }, contentDetails: {} },
    { ...member(), contentDetails: { videoId: videoId(2) } },
    { ...member(), contentDetails: { videoId: 'not-a-video' } },
    { ...member(), snippet: { ...member().snippet, publishedAt: 1 } },
    { ...member(), snippet: { ...member().snippet, position: -1 } },
  ])('D: unmappable/malformed item %# forbids trusted completion', async (item) => {
    await rejectsWithoutCompletion(membershipPage([item as ReturnType<typeof member>]), 'unmappable-membership');
  });
  it('accepts one trustworthy ID source without requiring both', async () => {
    const item = member();
    const scan = setup([membershipPage([{ ...item, contentDetails: {} } as typeof item]), videosPage()]);
    expect((await scan.run()).at(-1)?.kind).toBe('trusted-complete');
  });
  it('E: valid earlier pages survive as yielded progress but later failure yields no terminal capability', async () => {
    const scan = setup([membershipPage([member()], 'next', 2), videosPage(), { ...membershipPage([]), items: undefined }]);
    await expect(scan.run()).rejects.toMatchObject({ code: 'malformed-response' });
    expect(scan.events).toHaveLength(1); expect(pages(scan.events)[0]!.records[0]!.videoId).toBe(videoId());
    expect(scan.events.some(isTrustedProviderCompletion)).toBe(false);
  });
  it.each([{ tokens: ['a', 'a'] }, { tokens: ['a', 'b', 'a'] }])('F: repeated/cyclic tokens fail in finite requests: %j', async ({ tokens }) => {
    const bodies = tokens.flatMap((token, index) => [membershipPage([member(index + 1)], token, null), videosPage([metadata(index + 1)])]);
    const scan = setup(bodies);
    await expect(scan.run()).rejects.toMatchObject({ code: 'pagination-integrity' });
    expect(scan.fetcher).toHaveBeenCalledTimes(tokens.length * 2 - 1);
    expect(scan.events.some(isTrustedProviderCompletion)).toBe(false);
  });
  it('rejects an empty continuing page rather than chasing unique tokens forever', async () => {
    await rejectsWithoutCompletion(membershipPage([], 'next'), 'pagination-integrity');
  });
  it.each([
    { ...membershipPage(), pageInfo: { resultsPerPage: 0, totalResults: 1 } },
    membershipPage([member()], undefined, 0), membershipPage([member()], undefined, 2),
    membershipPage([], undefined, null), membershipPage([], undefined, 1),
  ])('count inconsistencies %# are not completion proof', async (body) => { await rejectsWithoutCompletion(body, 'count-integrity'); });
  it('changing totals fail even when the last total would match observed count', async () => {
    const scan = setup([membershipPage([member()], 'next', 3), videosPage(), membershipPage([member(2)], undefined, 2)]);
    await expect(scan.run()).rejects.toMatchObject({ code: 'count-integrity' });
    expect(scan.events.some(isTrustedProviderCompletion)).toBe(false);
  });
});

describe('Membership versus hydration (AC-RECON-008–011)', () => {
  it.each([
    [videosPage(), { state: 'available', evidence: 'public' }],
    [videosPage([{ ...metadata(), status: { privacyStatus: 'private', uploadStatus: 'processed' } }]), { state: 'unavailable', evidence: 'private' }],
    [videosPage([{ ...metadata(), status: {} } as ReturnType<typeof metadata>]), { state: 'unknown', evidence: 'unknown' }],
    [videosPage([]), { state: 'unknown', evidence: 'lookup-omitted' }],
  ])('unknown playlist privacy adds no availability evidence; hydration determines %j', async (hydration, expected) => {
    const item = { ...member(), status: { privacyStatus: UNKNOWN_PLAYLIST_PRIVACY_STATUS } };
    expect(validateMembershipPage(membershipPage([item]), bootstrap.likesPlaylistId).memberships).toEqual([
      { sourceId: 'source-1', videoId: videoId(), likedAt: '2026-09-01T10:00:00.000Z', position: 0 },
    ]);
    const scan = setup([membershipPage([item]), hydration]);
    const events = await scan.run();
    expect(pages(events)[0]!.records[0]!.availability).toEqual(expected);
    expect(isTrustedProviderCompletion(events.at(-1))).toBe(true);
    expect(scan.fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(events)).not.toContain(UNKNOWN_PLAYLIST_PRIVACY_STATUS);
  });
  it('C: missing requested metadata preserves the member and trustworthy completion', async () => {
    const scan = setup([membershipPage(), videosPage([])]);
    const events = await scan.run();
    expect(pages(events)[0]!.records[0]).toMatchObject({ videoId: videoId(), title: null, channelId: null,
      availability: { state: 'unknown', evidence: 'lookup-omitted' }, metadataFreshness: { title: null } });
    expect(events.at(-1)?.kind).toBe('trusted-complete');
  });
  it('G: hydration response order joins by ID and preserves membership traversal order', async () => {
    const scan = setup([membershipPage([member(1), member(2)]), videosPage([metadata(2), metadata(1)])]);
    const records = pages(await scan.run())[0]!.records;
    expect(records.map(({ videoId, title }) => [videoId, title])).toEqual([[videoId(1), 'Video 1'], [videoId(2), 'Video 2']]);
  });
  it('H: distinct source IDs deduplicate video IDs, retain all sources, and prefer first occurrence liked date', async () => {
    const later = { ...member(2, videoId()), snippet: { ...member(2, videoId()).snippet, publishedAt: '2026-09-02T10:00:00Z' } };
    const scan = setup([membershipPage([member(), later]), videosPage()]);
    const events = await scan.run();
    expect(pages(events)[0]!.records).toHaveLength(1);
    expect(pages(events)[0]!.records[0]).toMatchObject({ membershipSourceIds: ['source-1', 'source-2'], likedAt: '2026-09-01T10:00:00.000Z' });
    expect(events.at(-1)).toMatchObject({ progress: { rawItems: 2, uniqueMembership: 1, duplicateVideoItems: 1 } });
    expect(new URL(scan.fetcher.mock.calls[1]![0]).searchParams.get('id')).toBe(videoId());
  });
  it('deduplicates across pages without losing earlier sources or renewing their observation', async () => {
    const scan = setup([membershipPage([member()], 'next', 2), videosPage(), membershipPage([member(2, videoId())], undefined, 2), videosPage()]);
    let now = Date.parse('2026-10-04T12:00:00Z'); scan.clock.now = () => now;
    const iterator = scan.provider.enumerateLikedVideos(context, scan.abort.signal);
    await iterator.next(); now += 1000;
    expect((await iterator.next()).value).toMatchObject({ kind: 'page', records: [{ membershipSourceIds: ['source-1', 'source-2'],
      membershipObservedAt: '2026-10-04T12:00:00.000Z', metadataFetchedAt: '2026-10-04T12:00:01.000Z' }] });
    expect((await iterator.next()).value).toMatchObject({ progress: { uniqueMembership: 1, rawItems: 2 } });
  });
  it.each([false, true])('duplicate playlist-item ID fails even if video identity differs (%s)', async (conflict) => {
    await rejectsWithoutCompletion(membershipPage([member(), { ...member(2, conflict ? videoId(2) : videoId()), id: member().id }]), 'duplicate-source');
  });
  it('duplicate playlist-item ID across pages prevents completion', async () => {
    const scan = setup([membershipPage([member()], 'next', 2), videosPage(), membershipPage([member()], undefined, 2)]);
    await expect(scan.run()).rejects.toMatchObject({ code: 'duplicate-source' });
    expect(scan.events.some(isTrustedProviderCompletion)).toBe(false);
  });
  it.each([
    [{ privacyStatus: 'private', uploadStatus: 'processed' }, 'unavailable', 'private'],
    [{ privacyStatus: 'public', uploadStatus: 'deleted' }, 'unavailable', 'deleted'],
    [{ privacyStatus: 'public', uploadStatus: 'rejected' }, 'unavailable', 'rejected'],
    [{ privacyStatus: 'unlisted', uploadStatus: 'processed' }, 'available', 'unlisted'],
    [{ privacyStatus: 'public', uploadStatus: 'uploaded' }, 'unknown', 'unknown'],
    [{ privacyStatus: 'public', uploadStatus: 'failed' }, 'unknown', 'unknown'],
    [{}, 'unknown', 'unknown'],
  ])('maps availability only from explicit video evidence %j', async (status, state, evidence) => {
    const scan = setup([membershipPage(), videosPage([{ ...metadata(), status } as ReturnType<typeof metadata>])]);
    const events = await scan.run();
    expect(pages(events)[0]!.records[0]!.availability).toEqual({ state, evidence });
    expect(events.at(-1)?.kind).toBe('trusted-complete');
  });
  it('optional metadata omissions are explicit unknowns and playlist titles/channels are never creator metadata', async () => {
    const scan = setup([membershipPage([{ ...member(), snippet: { ...member().snippet, publishedAt: 'invalid' } }]),
      videosPage([{ kind: 'youtube#video', id: videoId(), snippet: {}, contentDetails: {}, status: {} } as ReturnType<typeof metadata>])]);
    const record = pages(await scan.run())[0]!.records[0]!;
    expect(record).toMatchObject({ title: null, likedAt: null, publishedAt: null, durationSeconds: null, thumbnailUrl: null,
      channelId: null, channelTitle: null, metadataFetchedAt: null, availability: { state: 'unknown', evidence: 'unknown' } });
  });
  it('missing liked date never falls back to video publication time', async () => {
    const item = member(); delete (item.snippet as { publishedAt?: string }).publishedAt;
    const scan = setup([membershipPage([item]), videosPage()]);
    expect(pages(await scan.run())[0]!.records[0]).toMatchObject({ likedAt: null, publishedAt: '2020-01-01T00:00:00.000Z' });
  });
  it('invalid duration/date strings become unknown without destroying membership or renewing known values', async () => {
    const scan = setup([membershipPage(), videosPage([{ ...metadata(), contentDetails: { duration: 'invalid' },
      snippet: { ...metadata().snippet, publishedAt: 'invalid' } }])]);
    const record = pages(await scan.run())[0]!.records[0]!;
    expect(record).toMatchObject({ durationSeconds: null, publishedAt: null, metadataFreshness: { durationSeconds: null, publishedAt: null } });
  });
  it.each([null, {}, { kind: 'youtube#videoListResponse' }, { ...videosPage(), items: {} },
    videosPage([metadata(2)]), videosPage([metadata(), metadata()]),
    videosPage([{ ...metadata(), snippet: undefined } as unknown as ReturnType<typeof metadata>]),
    videosPage([{ ...metadata(), contentDetails: undefined } as unknown as ReturnType<typeof metadata>]),
    videosPage([{ ...metadata(), status: undefined } as unknown as ReturnType<typeof metadata>]),
    videosPage([{ ...metadata(), status: { ...metadata().status, privacyStatus: UNKNOWN_PLAYLIST_PRIVACY_STATUS } }]),
    videosPage([{ ...metadata(), snippet: { ...metadata().snippet, title: 42 } } as unknown as ReturnType<typeof metadata>]),
    videosPage([{ ...metadata(), snippet: { ...metadata().snippet, thumbnails: { medium: { url: 'https://evil.example/x' } } } } as ReturnType<typeof metadata>]),
  ])('malformed hydration %# preserves failure and yields no trusted completion', async (body) => {
    const scan = setup([membershipPage(), body]);
    await expect(scan.run()).rejects.toMatchObject({ code: 'malformed-response' });
    expect(scan.events.some(isTrustedProviderCompletion)).toBe(false); expect(scan.fetcher).toHaveBeenCalledTimes(2);
  });
  it('metadata failure after an earlier page retains earlier progress without completion', async () => {
    const scan = setup([membershipPage([member()], 'next', 2), videosPage(), membershipPage([member(2)], undefined, 2), {}]);
    await expect(scan.run()).rejects.toMatchObject({ code: 'malformed-response' });
    expect(pages(scan.events)).toHaveLength(1); expect(scan.events.some(isTrustedProviderCompletion)).toBe(false);
  });
  it('selects deterministic thumbnail quality without requiring maxres; missing images remain unknown', async () => {
    const video = metadata();
    video.snippet.thumbnails = { ...video.snippet.thumbnails, high: { url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' } } as typeof video.snippet.thumbnails;
    const scan = setup([membershipPage(), videosPage([video])]);
    expect(pages(await scan.run())[0]!.records[0]!.thumbnailUrl).toBe('https://i.ytimg.com/vi/x/hqdefault.jpg');
  });
});

describe('Duration and UTC normalization (AC-RECON-010)', () => {
  it.each([['PT45S', 45], ['PT0S', 0], ['PT4M5S', 245], ['PT1H2M3S', 3723], ['PT100H', 360000],
    ['P2DT3H4M5S', 183845], ['PT0.5S', 0.5], ['P1Y', null], ['PT', null], ['P1DT', null],
    ['PT-1S', null], ['invalid', null], ['PT999999999999999999999999H', null], [undefined, null],
  ])('normalizes %s to %s seconds or unknown', (input, expected) => { expect(durationSeconds(input)).toBe(expected); });
  it('normalizes real ISO dates and rejects invalid dates', () => {
    expect(canonicalTimestamp('2026-10-04T12:00:00+03:00')).toBe('2026-10-04T09:00:00.000Z');
    expect(canonicalTimestamp('2026-02-30T00:00:00Z')).toBeNull();
  });
});

describe('Authenticated ingestion and bounded retries (AC-AUTH-004, AC-SYNC-009/010 provider portions)', () => {
  it('reuses exact-token recovery once, silently rechecks owner then retries the original request', async () => {
    const scan = setup([]);
    scan.chrome.getAuthToken.mockResolvedValueOnce({ token: TOKEN_A }).mockResolvedValue({ token: TOKEN_B });
    scan.fetcher.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(channelResponse()))
      .mockResolvedValueOnce(json(membershipPage())).mockResolvedValueOnce(json(videosPage()));
    await scan.run();
    expect(scan.chrome.removeCachedAuthToken).toHaveBeenCalledExactlyOnceWith({ token: TOKEN_A });
    expect(scan.fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/youtube/v3/playlistItems', '/youtube/v3/channels', '/youtube/v3/playlistItems', '/youtube/v3/videos']);
    expect(scan.fetcher.mock.calls[0]![0]).toBe(scan.fetcher.mock.calls[2]![0]);
    expect(scan.chrome.getAuthToken.mock.calls.every(([args]) => args?.interactive === false)).toBe(true);
  });
  it('second 401 fails, invalidates the replacement, and never returns trusted empty', async () => {
    const scan = setup([]);
    scan.chrome.getAuthToken.mockResolvedValueOnce({ token: TOKEN_A }).mockResolvedValue({ token: TOKEN_B });
    scan.fetcher.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(channelResponse())).mockResolvedValueOnce(json({}, 401));
    await expect(scan.run()).rejects.toMatchObject({ code: 'auth-required' });
    expect(scan.chrome.removeCachedAuthToken.mock.calls).toEqual([[{ token: TOKEN_A }], [{ token: TOKEN_B }]]);
    expect(scan.chrome.getAuthToken).toHaveBeenCalledTimes(2); expect(scan.events).toEqual([]);
  });
  it('does not restart auth recovery on a later page/hydration request', async () => {
    const scan = setup([]);
    scan.fetcher.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(channelResponse()))
      .mockResolvedValueOnce(json(membershipPage())).mockResolvedValueOnce(json({}, 401));
    await expect(scan.run()).rejects.toMatchObject({ code: 'auth-required' });
    expect(scan.fetcher).toHaveBeenCalledTimes(4);
    expect(scan.chrome.getAuthToken).toHaveBeenCalledTimes(3); // two first-call acquisitions, one hydration acquisition
    expect(scan.events.some(isTrustedProviderCompletion)).toBe(false);
  });
  it('token recovery does not reset the original request transient retry allowance', async () => {
    const scan = setup([]);
    scan.fetcher.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(channelResponse())).mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({}, 503));
    await expect(scan.run()).rejects.toMatchObject({ code: 'unavailable' });
    expect(scan.fetcher).toHaveBeenCalledTimes(5);
    expect(scan.clock.sleep.mock.calls.map(([delay]) => delay)).toEqual([1000, 2000]);
    expect(scan.events).toEqual([]);
  });
  it.each(['channel', 'playlist'])('replacement %s mismatch stops before retrying membership', async (field) => {
    const scan = setup([]); const owner = channelResponse();
    if (field === 'channel') owner.items[0]!.id = 'other-owner';
    else owner.items[0]!.contentDetails.relatedPlaylists.likes = 'other-playlist';
    scan.fetcher.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(owner));
    await expect(scan.run()).rejects.toMatchObject({ code: 'owner-mismatch' });
    expect(scan.fetcher).toHaveBeenCalledTimes(2); expect(scan.events).toEqual([]);
  });
  it.each([[403, {}, 'permission-denied', 1], [403, { error: { errors: [{ reason: 'quotaExceeded' }] } }, 'quota', 1],
    [403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }, 'rate-limit', 3],
    [429, {}, 'rate-limit', 3], [500, {}, 'unavailable', 3], [502, {}, 'unavailable', 3],
    [503, {}, 'unavailable', 3], [504, {}, 'unavailable', 3], [501, {}, 'unavailable', 1], [404, {}, 'unavailable', 1],
  ])('HTTP %s maps to %s with finite attempts', async (status, body, code, calls) => {
    const scan = setup([]); scan.fetcher.mockImplementation(() => Promise.resolve(json(body, status)));
    await expect(scan.run()).rejects.toMatchObject({ code, detail: { phase: 'scanning' } });
    expect(scan.fetcher).toHaveBeenCalledTimes(calls); expect(scan.events.some(isTrustedProviderCompletion)).toBe(false);
    expect(scan.clock.sleep.mock.calls.map(([delay]) => delay)).toEqual(calls === 3 ? [1000, 2000] : []);
  });
  it('network failure exhausts two additional retries without exposing raw exceptions', async () => {
    const scan = setup([]); scan.fetcher.mockRejectedValue(new TypeError(`private ${TOKEN_A}`));
    await expect(scan.run()).rejects.toMatchObject({ code: 'network', message: 'Likedex authentication: network' });
    expect(scan.fetcher).toHaveBeenCalledTimes(3); expect(scan.events).toEqual([]);
  });
  it('transport failure during hydration never becomes a valid omission', async () => {
    const scan = setup([membershipPage()]); scan.fetcher.mockRejectedValue(new TypeError('offline'));
    await expect(scan.run()).rejects.toMatchObject({ code: 'network' });
    expect(scan.fetcher).toHaveBeenCalledTimes(4); expect(scan.events).toEqual([]);
  });
  it('bounds aggregate retries at six across both endpoints and pages', async () => {
    const scan = setup([]); let attempts = 0;
    scan.fetcher.mockImplementation((url) => {
      attempts++;
      if (attempts % 3 !== 0) return Promise.resolve(json({}, 503));
      return Promise.resolve(json(new URL(url).pathname.endsWith('playlistItems')
        ? membershipPage([member(attempts)], `next-${attempts}`, null) : videosPage([])));
    });
    await expect(scan.run()).rejects.toMatchObject({ code: 'request-budget' });
    expect(scan.clock.sleep).toHaveBeenCalledTimes(6); expect(scan.fetcher).toHaveBeenCalledTimes(10);
    expect(pages(scan.events)).toHaveLength(1); expect(scan.events.some(isTrustedProviderCompletion)).toBe(false);
  });
  it.each(['31', 'Sun, 04 Oct 2026 12:00:31 GMT'])('long Retry-After %s stops with rate-limit guidance', async (header) => {
    const scan = setup([]); scan.fetcher.mockResolvedValueOnce(json({}, 429, { 'Retry-After': header }));
    await expect(scan.run()).rejects.toMatchObject({ code: 'rate-limit' });
    expect(scan.fetcher).toHaveBeenCalledTimes(1); expect(scan.clock.sleep).not.toHaveBeenCalled();
  });
  it('honors Retry-After and bounded jitter using injected timing', async () => {
    const scan = setup([]); scan.clock.random = () => 0.9999;
    scan.fetcher.mockResolvedValueOnce(json({}, 429, { 'Retry-After': '4' })).mockResolvedValueOnce(json(membershipPage([])));
    await scan.run(); expect(scan.clock.sleep).toHaveBeenCalledWith(4000, expect.any(AbortSignal));
    const jittered = setup([]); jittered.clock.random = () => 0.9999;
    jittered.fetcher.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json(membershipPage([])));
    await jittered.run(); expect(jittered.clock.sleep).toHaveBeenCalledWith(1250, expect.any(AbortSignal));
  });
  it('caps wall time including consumer pauses before terminal capability', async () => {
    const scan = setup([membershipPage([])]); let now = Date.parse('2026-10-04T12:00:00Z'); scan.clock.now = () => now;
    const iterator = scan.provider.enumerateLikedVideos(context, scan.abort.signal);
    expect((await iterator.next()).value?.kind).toBe('page'); now += 600_000;
    await expect(iterator.next()).rejects.toMatchObject({ code: 'request-budget' });
  });
  it('injects the 20s fetch/body deadline and retries its transport timeout without real sleeps', async () => {
    const scan = setup([]);
    const deadline = new AbortController();
    const timeout = vi.fn((ms: number) => ms === 20_000 ? deadline.signal : new AbortController().signal);
    (scan.clock as RequestTiming).timeout = timeout;
    scan.fetcher.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new TypeError('fetch timeout')), { once: true });
    })).mockResolvedValueOnce(json(membershipPage([])));
    const run = scan.run(); await vi.waitFor(() => expect(scan.fetcher).toHaveBeenCalledTimes(1));
    deadline.abort();
    // Supply a fresh deadline for the retry.
    timeout.mockImplementation(() => new AbortController().signal);
    await run;
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([600_000, 20_000, 600_000, 20_000]);
    expect(scan.clock.sleep).toHaveBeenCalledWith(1000, expect.any(AbortSignal));
    expect(scan.events.at(-1)?.kind).toBe('trusted-complete');
  });
  it('stops when a fetch body consumes the remaining whole-scan budget', async () => {
    const scan = setup([]); let now = Date.parse('2026-10-04T12:00:00Z'); scan.clock.now = () => now;
    scan.fetcher.mockImplementationOnce(() => { now += 600_000; return Promise.resolve(json(membershipPage([]))); });
    await expect(scan.run()).rejects.toMatchObject({ code: 'request-budget' });
    expect(scan.clock.sleep).not.toHaveBeenCalled(); expect(scan.events).toEqual([]);
  });
  it('aborting after a terminal page prevents the terminal capability', async () => {
    const scan = setup([membershipPage([])]); const iterator = scan.provider.enumerateLikedVideos(context, scan.abort.signal);
    await iterator.next(); scan.abort.abort();
    await expect(iterator.next()).rejects.toMatchObject({ code: 'cancelled' });
  });
  it('cancellation during backoff stops before another request', async () => {
    const scan = setup([]); scan.fetcher.mockResolvedValueOnce(json({}, 503));
    scan.clock.sleep.mockImplementation(() => { scan.abort.abort(); return Promise.resolve(); });
    await expect(scan.run()).rejects.toMatchObject({ code: 'cancelled' }); expect(scan.fetcher).toHaveBeenCalledTimes(1);
  });
  it('cancellation of a held fetch or body never yields a page/proof', async () => {
    const scan = setup([]); const response = held<Response>(); scan.fetcher.mockReturnValueOnce(response.promise);
    const run = scan.run(); await vi.waitFor(() => expect(scan.fetcher).toHaveBeenCalledTimes(1));
    scan.abort.abort(); response.resolve(json(membershipPage([])));
    await expect(run).rejects.toMatchObject({ code: 'cancelled' }); expect(scan.events).toEqual([]);
  });
  it('an interrupted iterator has no terminal proof even after the terminal page', async () => {
    const scan = setup([membershipPage([])]); const iterator = scan.provider.enumerateLikedVideos(context, scan.abort.signal);
    const page = (await iterator.next()).value; expect(isTrustedProviderCompletion(page)).toBe(false);
    await iterator.return(); expect(scan.fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('Completion authority and phase boundaries', () => {
  it('binds immutable evidence to owner/attempt/fences and rejects fabricated or serialized proofs', async () => {
    const scan = setup(); const completion = (await scan.run()).at(-1)!;
    expect(isTrustedProviderCompletion(completion)).toBe(true);
    expect(completion).toMatchObject({ scope: { attemptId: context.attemptId, ownerChannelId: bootstrap.channelId,
      likesPlaylistId: bootstrap.likesPlaylistId, dataGeneration: 7, authEpoch: 3 }, validatorRevision: 1,
      pageChain: [{ pageNumber: 1, rawItems: 1, terminal: true }], membershipVideoIds: [videoId()] });
    expect(isTrustedProviderCompletion({ complete: true })).toBe(false);
    expect(isTrustedProviderCompletion(JSON.parse(JSON.stringify(completion)))).toBe(false);
    expect(Object.isFrozen(completion)).toBe(true);
    if (completion.kind === 'trusted-complete') {
      expect(Object.isFrozen(completion.scope)).toBe(true); expect(Object.isFrozen(completion.membershipVideoIds)).toBe(true);
      expect(Object.isFrozen(completion.pageChain[0])).toBe(true);
    }
  });
  it('mutating a yielded page cannot rewrite final membership or counts', async () => {
    const scan = setup(); const iterator = scan.provider.enumerateLikedVideos(context, scan.abort.signal);
    const page = (await iterator.next()).value!;
    if (page.kind !== 'page') throw new Error('Expected page');
    page.records[0]!.videoId = videoId(2); page.progress.rawItems = 999;
    expect((await iterator.next()).value).toMatchObject({ membershipVideoIds: [videoId()], progress: { rawItems: 1 } });
  });
  it('rejects invalid attempt context before contacting Chrome or YouTube', async () => {
    const scan = setup(); const iterator = scan.provider.enumerateLikedVideos({ ...context, attemptId: 'invalid' }, scan.abort.signal);
    await expect(iterator.next()).rejects.toMatchObject({ code: 'invalid-context' });
    expect(scan.chrome.getAuthToken).not.toHaveBeenCalled(); expect(scan.fetcher).not.toHaveBeenCalled();
  });
  it('provider modules have no storage/Dexie dependency (lint enforces future imports)', () => {
    for (const file of readdirSync('src/provider').filter((file) => file.endsWith('.ts'))) {
      expect(readFileSync(`src/provider/${file}`, 'utf8')).not.toMatch(/from\s+['"][^'"]*(?:storage\/|dexie)/);
    }
  });
});
