import { describe, expect, it } from 'vitest';
import { deriveSyncProgress } from '@/src/options/presentation';
import { attempt } from '../fixtures/storage';

describe('Truthful membership progress (AC-SYNC-005)', () => {
  it.each([
    [425, 3547, 12], [0, 200, 0], [5, 200, 3], [1750, 3547, 49],
    [3547, 3547, 100], [1, 8, 13], [99, 200, 50], [300, 200, 100],
  ])('derives %s / %s with nearest-integer text %s', (rawItems, estimatedTotal, percentage) => {
    const result = deriveSyncProgress({ rawItems, estimatedTotal });
    expect(result).toMatchObject({ mode: 'determinate', rawItems, estimatedTotal, percentage });
    expect(result.widthPercent).toBe(Math.min(100, rawItems / estimatedTotal * 100));
  });
  it.each([null, 0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('uses indeterminate for unusable total %s', (estimatedTotal) => {
    expect(deriveSyncProgress({ rawItems: 100, estimatedTotal })).toEqual({ mode: 'indeterminate', rawItems: 100,
      estimatedTotal: null, percentage: null, widthPercent: null });
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('never fabricates a count or negative width from %s', (rawItems) => {
    expect(deriveSyncProgress({ rawItems, estimatedTotal: 200 })).toEqual({ mode: 'indeterminate', rawItems: null,
      estimatedTotal: null, percentage: null, widthPercent: null });
  });
  it('counts duplicate video membership items as processed, independently of the unique count', () => {
    const checkpoint = attempt({ rawItems: 100, uniqueMembership: 95, estimatedTotal: 200 });
    expect(deriveSyncProgress(checkpoint).percentage).toBe(50);
    const differentUnique = { ...checkpoint, uniqueMembership: 1 };
    expect(deriveSyncProgress(differentUnique).percentage).toBe(50);
  });
});
