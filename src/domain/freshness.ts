// Conservative boundary selected by engineering: midnight UTC, 30 dates later.
export function retentionDeadline(observedAt: string): string {
  const date = new Date(observedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== observedAt) {
    throw new RangeError('Expected a canonical UTC instant.');
  }
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString();
}
