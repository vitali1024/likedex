import { z } from 'zod';
import { retentionDeadline } from './freshness';

export const instantSchema = z.iso.datetime().refine((value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}, 'Expected a canonical UTC ISO instant with milliseconds.');
const id = z.string().min(1).refine((value) => !/\s/.test(value));
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const freshnessSchema = z.strictObject({
  observedAt: instantSchema,
  expiresAt: instantSchema,
}).refine(({ observedAt, expiresAt }) => instantSchema.safeParse(observedAt).success
  && instantSchema.safeParse(expiresAt).success && expiresAt > observedAt
  && expiresAt <= retentionDeadline(observedAt), 'Invalid freshness deadline.');
export type Freshness = z.infer<typeof freshnessSchema>;

export const ownerSchema = z.strictObject({
  channelId: id,
  likesPlaylistId: id,
  displayName: z.string().nullable(),
  verifiedAt: instantSchema,
  freshness: freshnessSchema,
}).refine((owner) => owner.verifiedAt === owner.freshness.observedAt);
export type RemoteOwner = z.infer<typeof ownerSchema>;

export const availabilitySchema = z.strictObject({
  state: z.enum(['available', 'unavailable', 'unknown']),
  evidence: z.enum(['public', 'unlisted', 'private', 'deleted', 'rejected', 'lookup-omitted', 'not-fetched', 'unknown']),
}).refine(({ state, evidence }) => {
  if (state === 'available') return evidence === 'public' || evidence === 'unlisted';
  if (state === 'unavailable') return ['private', 'deleted', 'rejected'].includes(evidence);
  return ['lookup-omitted', 'not-fetched', 'unknown'].includes(evidence);
});

const metadataFields = ['title', 'channelId', 'channelTitle', 'description', 'thumbnailUrl',
  'publishedAt', 'durationSeconds', 'availability'] as const;
// Independent field lineage avoids renewing retained metadata on partial hydration.
const metadataFreshnessSchema = z.strictObject({
  title: freshnessSchema.nullable(),
  channelId: freshnessSchema.nullable(),
  channelTitle: freshnessSchema.nullable(),
  description: freshnessSchema.nullable(),
  thumbnailUrl: freshnessSchema.nullable(),
  publishedAt: freshnessSchema.nullable(),
  durationSeconds: freshnessSchema.nullable(),
  availability: freshnessSchema.nullable(),
});

export const videoSchema = z.strictObject({
  videoId: id,
  ownerChannelId: id,
  membershipSourceIds: z.array(id).min(1).refine((ids) => new Set(ids).size === ids.length),
  lastSeenAttemptId: z.uuid(),
  title: z.string().nullable(),
  channelId: id.nullable(),
  channelTitle: z.string().nullable(),
  description: z.string().nullable(),
  thumbnailUrl: z.url().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.username === '' && url.password === '';
    } catch { return false; }
  }).nullable(),
  likedAt: instantSchema.nullable(),
  publishedAt: instantSchema.nullable(),
  durationSeconds: z.number().finite().nonnegative().nullable(),
  availability: availabilitySchema,
  membershipObservedAt: instantSchema,
  membershipFreshness: freshnessSchema,
  metadataFetchedAt: instantSchema.nullable(),
  metadataFreshness: metadataFreshnessSchema,
}).superRefine((video, context) => {
  if (video.membershipObservedAt !== video.membershipFreshness.observedAt) {
    context.addIssue({ code: 'custom', message: 'Membership observation must match provenance.' });
  }
  const observations: string[] = [];
  for (const field of metadataFields) {
    const provenance = video.metadataFreshness[field];
    const known = field === 'availability'
      ? video.availability.evidence !== 'not-fetched' && video.availability.evidence !== 'unknown'
      : video[field] !== null;
    if (known && provenance === null) {
      context.addIssue({ code: 'custom', message: `Missing ${field} provenance.` });
    }
    if (provenance !== null) observations.push(provenance.observedAt);
  }
  const latest = observations.sort().at(-1) ?? null;
  if (video.metadataFetchedAt !== latest) {
    context.addIssue({ code: 'custom', message: 'Metadata fetch time must reflect actual field observations.' });
  }
});
export type MirroredVideo = z.infer<typeof videoSchema>;

export const attemptStateSchema = z.enum([
  'preparing', 'scanning', 'applying', 'finalizing', 'success', 'partial', 'failure', 'interrupted',
]);
export const errorSchema = z.strictObject({
  category: z.enum(['authentication', 'authorization-unverified', 'permission', 'oauth-configuration',
    'owner-mismatch', 'identity', 'quota', 'rate-limit', 'provider', 'network', 'malformed-provider',
    'untrusted-enumeration', 'persistence', 'interrupted', 'runtime', 'internal']),
  // A key, never a raw exception message, response body, or URL.
  messageKey: z.enum(['connect-required', 'access-unverified', 'permission-denied', 'configuration-error',
    'owner-mismatch', 'identity-unavailable', 'quota-exhausted', 'rate-limited', 'provider-failed',
    'network-failed', 'provider-invalid', 'enumeration-untrusted', 'storage-failed',
    'worker-interrupted', 'runtime-failed', 'unexpected-error']),
  phase: attemptStateSchema,
});
export type DomainError = z.infer<typeof errorSchema>;

// Durable audit summary only. This is NOT the future pruning capability.
const completionEvidenceSchema = z.strictObject({
  validatorRevision: counter,
  acceptedPages: counter,
  rawItems: counter,
  uniqueMembership: counter,
  terminalPageObservedAt: instantSchema,
});
export const attemptSchema = z.strictObject({
  attemptId: z.uuid(),
  requestId: z.uuid(),
  ownerChannelId: id.nullable(),
  dataGeneration: counter,
  authEpoch: counter,
  workerInstanceId: z.uuid(),
  state: attemptStateSchema,
  startedAt: instantSchema,
  updatedAt: instantSchema,
  finishedAt: instantSchema.nullable(),
  pagesAccepted: counter,
  rawItems: counter,
  uniqueMembership: counter,
  safeCommits: counter,
  addedCount: counter.default(0),
  updatedCount: counter.default(0),
  retrying: z.boolean(),
  estimatedTotal: counter.nullable(),
  error: errorSchema.nullable(),
  completionEvidence: completionEvidenceSchema.nullable(),
  freshness: freshnessSchema,
}).refine((attempt) => attempt.startedAt <= attempt.updatedAt
  && (attempt.finishedAt === null || attempt.finishedAt >= attempt.updatedAt)
  && (isActiveAttempt(attempt.state) === (attempt.finishedAt === null))
  && attempt.uniqueMembership <= attempt.rawItems);
export type SyncAttempt = z.infer<typeof attemptSchema>;
export function isActiveAttempt(state: z.infer<typeof attemptStateSchema>): boolean {
  return ['preparing', 'scanning', 'applying', 'finalizing'].includes(state);
}

export const latestSuccessSchema = z.strictObject({
  attemptId: z.uuid(),
  ownerChannelId: id,
  dataGeneration: counter,
  startedAt: instantSchema,
  completedAt: instantSchema,
  pageCount: counter,
  rawRemoteCount: counter,
  uniqueRemoteCount: counter,
  localMembershipCount: counter,
  localAvailableCount: counter,
  addedCount: counter,
  updatedCount: counter,
  removedCount: counter,
  freshness: freshnessSchema,
}).refine((success) => success.completedAt >= success.startedAt
  && success.localAvailableCount <= success.localMembershipCount
  && success.uniqueRemoteCount <= success.rawRemoteCount);
export type LatestSuccessfulSync = z.infer<typeof latestSuccessSchema>;

export const syncSchema = z.strictObject({
  currentAttempt: attemptSchema.nullable(),
  previousCompletedResult: attemptSchema.nullable().refine((attempt) =>
    attempt === null || !isActiveAttempt(attempt.state)),
  latestSuccessfulSync: latestSuccessSchema.nullable(),
  lastMirrorChangeRevision: counter,
  lastFinalizedMirrorRevision: counter.nullable(),
});
export type SyncMetadata = z.infer<typeof syncSchema>;

export const cleanupReasonSchema = z.enum(['disconnect', 'authorization-invalid', 'authorization-unverified', 'expiry']);
export type CleanupReason = z.infer<typeof cleanupReasonSchema>;
const outcome = z.enum(['not-requested', 'pending', 'succeeded', 'failed', 'unconfirmed']);
export const controlSchema = z.strictObject({
  dataGeneration: counter,
  revision: counter,
  connectionGate: z.enum(['disconnected', 'connected']),
  authEpoch: counter,
  revocationStatus: outcome,
  cacheInvalidationStatus: outcome,
  deletionStatus: outcome,
  pendingCleanupReason: cleanupReasonSchema.nullable(),
  lastCleanupReason: z.enum(['clear', 'disconnect', 'authorization-invalid', 'authorization-unverified', 'expiry']).nullable(),
  authorizationCheckDueAt: instantSchema.nullable(),
  lastClockSeenAt: instantSchema.nullable(),
}).refine((control) => control.pendingCleanupReason === null
  || control.deletionStatus === 'pending' || control.deletionStatus === 'failed');
export type ControlState = z.infer<typeof controlSchema>;

export const fenceSchema = z.strictObject({
  dataGeneration: counter,
  authEpoch: counter,
  revision: counter,
  ownerChannelId: id.nullable(),
  attemptId: z.uuid().nullable(),
});
export type WriteFence = z.infer<typeof fenceSchema>;

// Local repository contract, not an RPC response or authorization decision.
export interface LibrarySnapshot {
  control: ControlState;
  owner: RemoteOwner | null;
  videos: MirroredVideo[];
  sync: SyncMetadata | null;
  earliestExpiresAt: string | null;
  fence: WriteFence;
}

export function retainedFreshness(owner: RemoteOwner | null, videos: MirroredVideo[], sync: SyncMetadata | null): Freshness[] {
  const facts: Freshness[] = owner === null ? [] : [owner.freshness];
  for (const video of videos) {
    facts.push(video.membershipFreshness);
    for (const field of metadataFields) {
      const provenance = video.metadataFreshness[field];
      if (provenance !== null) facts.push(provenance);
    }
  }
  if (sync !== null) {
    for (const record of [sync.currentAttempt, sync.previousCompletedResult, sync.latestSuccessfulSync]) {
      if (record !== null) facts.push(record.freshness);
    }
  }
  return facts;
}
