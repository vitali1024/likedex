import type { Freshness, LatestSuccessfulSync, MirroredVideo, RemoteOwner, SyncAttempt } from '@/src/domain/contracts';
import { retentionDeadline } from '@/src/domain/freshness';

export const NOW = '2026-10-04T12:00:00.000Z';
export const OBSERVED = '2026-09-15T12:00:00.000Z';
export const ATTEMPT_ID = '00000000-0000-4000-8000-000000000001';
export const NEXT_ATTEMPT_ID = '00000000-0000-4000-8000-000000000002';
export function freshness(observedAt = OBSERVED): Freshness {
  return { observedAt, expiresAt: retentionDeadline(observedAt) };
}
export function owner(channelId = 'owner-a'): RemoteOwner {
  return { channelId, likesPlaylistId: `likes-${channelId}`, displayName: 'Same display name',
    verifiedAt: OBSERVED, freshness: freshness() };
}
export function attempt(overrides: Partial<SyncAttempt> = {}): SyncAttempt {
  return {
    attemptId: ATTEMPT_ID, requestId: '00000000-0000-4000-8000-000000000003', ownerChannelId: 'owner-a',
    dataGeneration: 0, authEpoch: 0, workerInstanceId: '00000000-0000-4000-8000-000000000004',
    state: 'scanning', startedAt: OBSERVED, updatedAt: OBSERVED, finishedAt: null,
    pagesAccepted: 0, rawItems: 0, uniqueMembership: 0, safeCommits: 0, retrying: false,
    estimatedTotal: null, error: null, completionEvidence: null, freshness: freshness(), ...overrides,
  };
}
export function success(): LatestSuccessfulSync {
  return { attemptId: ATTEMPT_ID, ownerChannelId: 'owner-a', dataGeneration: 0,
    startedAt: OBSERVED, completedAt: OBSERVED, pageCount: 1, rawRemoteCount: 2, uniqueRemoteCount: 2,
    localMembershipCount: 2, localAvailableCount: 1, addedCount: 2, updatedCount: 0, removedCount: 0,
    freshness: freshness() };
}
export function video(videoId = 'video-a', overrides: Partial<MirroredVideo> = {}): MirroredVideo {
  return { videoId, ownerChannelId: 'owner-a', membershipSourceIds: [`item-${videoId}`],
    lastSeenAttemptId: ATTEMPT_ID, title: null, channelId: null, channelTitle: null, description: null,
    thumbnailUrl: null, likedAt: null, publishedAt: null, durationSeconds: null,
    availability: { state: 'unknown', evidence: 'not-fetched' },
    membershipObservedAt: OBSERVED, membershipFreshness: freshness(), metadataFetchedAt: null,
    metadataFreshness: { title: null, channelId: null, channelTitle: null, description: null,
      thumbnailUrl: null, publishedAt: null, durationSeconds: null, availability: null }, ...overrides,
  };
}
