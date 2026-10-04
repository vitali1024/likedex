import type { DomainError, Freshness, MirroredVideo, SyncAttempt } from './contracts';
import { retentionDeadline } from './freshness';

const transitions: Record<SyncAttempt['state'], readonly SyncAttempt['state'][]> = {
  preparing: ['scanning', 'failure', 'interrupted'],
  scanning: ['applying', 'failure', 'partial', 'interrupted'],
  applying: ['scanning', 'finalizing', 'failure', 'partial', 'interrupted'],
  finalizing: ['success', 'failure', 'partial', 'interrupted'],
  success: [], partial: [], failure: [], interrupted: [],
};
export function canTransition(from: SyncAttempt['state'], to: SyncAttempt['state']): boolean {
  return transitions[from].includes(to);
}
export function attemptOutcome(attempt: SyncAttempt, error: DomainError): 'failure' | 'partial' | 'interrupted' {
  return error.category === 'interrupted' ? 'interrupted' : attempt.safeCommits > 0 ? 'partial' : 'failure';
}
export function derivedFreshness(observedAt: string, facts: readonly Freshness[]): Freshness {
  return { observedAt, expiresAt: [retentionDeadline(observedAt), ...facts.map((fact) => fact.expiresAt)].sort()[0]! };
}

// Validated omissions do not renew or erase previously fetched field values.
export function mergeObservedVideo(previous: MirroredVideo | undefined, incoming: MirroredVideo): MirroredVideo {
  if (previous === undefined) return incoming;
  const result = { ...incoming, metadataFreshness: { ...incoming.metadataFreshness } };
  for (const field of ['title', 'channelId', 'channelTitle', 'description', 'thumbnailUrl', 'publishedAt', 'durationSeconds'] as const) {
    if (incoming.metadataFreshness[field] === null) {
      // Each assignment stays tied to its own field type and original lineage.
      Object.assign(result, { [field]: previous[field] });
      result.metadataFreshness[field] = previous.metadataFreshness[field];
    }
  }
  if (incoming.metadataFreshness.availability === null) {
    result.availability = previous.availability;
    result.metadataFreshness.availability = previous.metadataFreshness.availability;
  }
  result.metadataFetchedAt = Object.values(result.metadataFreshness)
    .flatMap((fact) => fact === null ? [] : [fact.observedAt]).sort().at(-1) ?? null;
  return result;
}
