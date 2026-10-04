import { describe, expect, it } from 'vitest';
import { freshnessSchema, instantSchema, videoSchema } from '@/src/domain/contracts';
import { retentionDeadline } from '@/src/domain/freshness';
import { freshness, video } from '../fixtures/storage';

describe('Freshness/calendar contracts (AC-DATA-011/013 unit portions)', () => {
  it.each([
    ['2026-09-15T23:59:59.999Z', '2026-10-15T00:00:00.000Z'],
    ['2026-03-01T12:00:00.000Z', '2026-03-31T00:00:00.000Z'],
    ['2026-10-10T12:00:00.000Z', '2026-11-09T00:00:00.000Z'],
    ['2028-02-01T12:00:00.000Z', '2028-03-02T00:00:00.000Z'],
    ['2026-12-31T12:00:00.000Z', '2027-01-30T00:00:00.000Z'],
  ])('uses UTC calendar arithmetic for %s across month/year/DST boundaries', (observedAt, deadline) => {
    expect(retentionDeadline(observedAt)).toBe(deadline);
  });

  it('rejects noncanonical/invalid times and deadlines beyond the conservative boundary', () => {
    expect(instantSchema.safeParse('2026-10-04T12:00:00+03:00').success).toBe(false);
    expect(instantSchema.safeParse('2026-02-30T12:00:00.000Z').success).toBe(false);
    expect(() => retentionDeadline('invalid')).toThrow(RangeError);
    expect(freshnessSchema.safeParse({ ...freshness(), expiresAt: '2026-10-15T00:00:00.001Z' }).success).toBe(false);
    expect(freshnessSchema.safeParse({ ...freshness(), expiresAt: freshness().observedAt }).success).toBe(false);
    expect(freshnessSchema.safeParse({ observedAt: '2026-02-30T12:00:00.000Z',
      expiresAt: '2026-03-30T00:00:00.000Z' }).success).toBe(false);
    expect(videoSchema.safeParse({ ...video(), thumbnailUrl: 'invalid' }).success).toBe(false);
  });

  it('represents nullable values without publication-to-liked substitution or private/deleted ambiguity', () => {
    const record = video();
    expect(videoSchema.parse(record)).toEqual(record);
    expect(videoSchema.safeParse({ ...record, availability: { state: 'available', evidence: 'private' } }).success).toBe(false);
    expect(videoSchema.safeParse({ ...record, durationSeconds: -1 }).success).toBe(false);
    expect(videoSchema.safeParse({ ...record, ownerChannelId: ' owner-a ' }).success).toBe(false);
  });
});
