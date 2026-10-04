import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { dateBoundary, INITIAL_QUERY, normalize, pageOf, queryLibrary, SORTS, youtubeUrl } from '@/src/library/query';
import { optionsVideos } from '../fixtures/options';
import { video } from '../fixtures/storage';

describe('Options local queries (AC-LIBRARY-001–010)', () => {
  const rows = optionsVideos(6);
  it('normalizes Unicode/case/whitespace and matches all terms across title/channel only', () => {
    expect(normalize('  ＣＡＦÉ  ')).toBe('café');
    expect(queryLibrary(rows, { ...INITIAL_QUERY, search: ' CAFÉ travel ' }).map((v) => v.videoId)).toEqual([rows[0]!.videoId]);
    expect(queryLibrary(rows, { ...INITIAL_QUERY, search: 'quiet' })).toEqual([]);
    expect(queryLibrary(rows, { ...INITIAL_QUERY, search: '  \t ' })).toHaveLength(6);
  });
  it('excludes unknown/unavailable membership without changing source data', () => {
    expect(queryLibrary([...rows, video('unknown'), video('unavailable', { availability: { state: 'unavailable', evidence: 'private' } })], INITIAL_QUERY)).toHaveLength(6);
    expect(rows[0]!.title).toBe('A café in the mountains');
  });
  it('combines filters with AND, channels with OR, and excludes unknown relevant values', () => {
    expect(queryLibrary(rows, { ...INITIAL_QUERY, channels: ['channel-a', 'channel-b'], duration: 'medium' })).toHaveLength(2);
    expect(queryLibrary(rows, { ...INITIAL_QUERY, channels: ['channel-a'], duration: 'medium' }).map((v) => v.videoId)).toEqual([rows[4]!.videoId]);
    expect(queryLibrary(rows, { ...INITIAL_QUERY, duration: 'short' })).toHaveLength(1);
    expect(queryLibrary(rows, { ...INITIAL_QUERY, duration: 'long' })).toHaveLength(2);
    expect(queryLibrary([video('unknown', { availability: { state: 'available', evidence: 'public' } })], { ...INITIAL_QUERY, channels: ['channel-a'] })).toEqual([]);
  });
  it('uses inclusive local calendar dates with explicit basis; invalid ranges match nothing', () => {
    const day = '2026-09-15', start = dateBoundary(day)!, end = dateBoundary(day, true)!;
    const dated = [start - 1, start, end - 1, end].map((time, i) => ({ ...rows[i]!, likedAt: new Date(time).toISOString() }));
    expect(queryLibrary(dated, { ...INITIAL_QUERY, from: day, to: day })).toHaveLength(2);
    expect(queryLibrary(rows, { ...INITIAL_QUERY, from: '2026-09-15', to: '2026-09-15', dateBasis: 'publishedAt' })).toHaveLength(5);
    expect(queryLibrary(rows, { ...INITIAL_QUERY, from: '2026-09-16', to: '2026-09-15' })).toEqual([]);
    expect(queryLibrary(rows, { ...INITIAL_QUERY, from: 'invalid' })).toEqual([]);
    expect(dateBoundary('2026-02-30')).toBeNull();
  });
  it.each(Object.keys(SORTS) as (keyof typeof SORTS)[])('%s places unknown last and resolves ties by ID', (sort) => {
    const known = { ...rows[0]!, videoId: 'bbbbbbbbbbb' };
    const earlier = { ...known, videoId: 'aaaaaaaaaaa' };
    const unknown = { ...known, videoId: '00000000000', title: null, likedAt: null, publishedAt: null, durationSeconds: null };
    expect(queryLibrary([known, unknown, earlier], { ...INITIAL_QUERY, sort }).map((v) => v.videoId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', '00000000000']);
  });
  it('orders dates/durations both ways and titles by normalized code-unit comparison', () => {
    expect(queryLibrary(rows, { ...INITIAL_QUERY, sort: 'liked-oldest' })[0]!.videoId).toBe(rows[5]!.videoId);
    expect(queryLibrary(rows, { ...INITIAL_QUERY, sort: 'duration-longest' })[0]!.durationSeconds).toBe(1200);
    expect(queryLibrary(rows, { ...INITIAL_QUERY, sort: 'duration-shortest' })[0]!.durationSeconds).toBe(239);
    expect(queryLibrary([{ ...rows[0]!, title: 'Ｂ' }, { ...rows[1]!, title: 'a' }], { ...INITIAL_QUERY, sort: 'title' })[0]!.title).toBe('a');
    const dated = [{ ...rows[0]!, publishedAt: '2026-01-01T00:00:00.000Z' }, { ...rows[1]!, publishedAt: '2026-02-01T00:00:00.000Z' }];
    expect(queryLibrary(dated, { ...INITIAL_QUERY, sort: 'published-newest' })[0]!.videoId).toBe(rows[1]!.videoId);
    expect(queryLibrary(dated, { ...INITIAL_QUERY, sort: 'published-oldest' })[0]!.videoId).toBe(rows[0]!.videoId);
  });
  it('constructs next-calendar-day boundaries across DST rather than adding 24 hours', () => {
    const prior = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      expect(dateBoundary('2026-03-08', true)! - dateBoundary('2026-03-08')!).toBe(23 * 3600000);
      expect(dateBoundary('2026-11-01', true)! - dateBoundary('2026-11-01')!).toBe(25 * 3600000);
    } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
  });
  it('bounds pages to 50, clamps and keeps the zero-result page safe', () => {
    expect(pageOf(optionsVideos(62), 1).rows).toHaveLength(50);
    expect(pageOf(optionsVideos(62), 99)).toMatchObject({ page: 2, pages: 2 });
    expect(pageOf([], 8)).toEqual({ rows: [], page: 1, pages: 1 });
    expect(pageOf(rows, -1).page).toBe(1);
  });
  it('constructs canonical links only from validated video IDs', () => {
    expect(youtubeUrl('abcdefghijk')).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    expect(youtubeUrl('evil/?x=1234')).toBeNull();
  });
  it('measures 3,000-record queries, P95 <200ms over 20 runs after warmup (AC-LIBRARY-010)', () => {
    const data = optionsVideos(3000), query = { ...INITIAL_QUERY, search: 'video', duration: 'medium' as const, sort: 'title' as const };
    queryLibrary(data, query);
    const samples = Array.from({ length: 20 }, () => { const start = performance.now(); queryLibrary(data, query); return performance.now() - start; });
    const p95 = samples.sort((a, b) => a - b)[18]!;
    expect(p95).toBeLessThan(200);
    expect(pageOf(queryLibrary(data, query), 1).rows.length).toBeLessThanOrEqual(50);
    console.info(`Options 3,000-record query P95: ${p95.toFixed(2)}ms (20 runs, local Node desktop)`);
  });
});
