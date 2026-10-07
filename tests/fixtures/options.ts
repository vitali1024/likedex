import type { RuntimeResult } from '@/src/runtime/contracts';
import { freshness, OBSERVED, owner, success, video } from './storage';

export function optionsVideos(count = 62) {
  return Array.from({ length: count }, (_, i) => video(`v${String(i).padStart(10, '0')}`, {
    title: i === 0 ? 'A café in the mountains' : `Video ${String(i).padStart(3, '0')}`,
    channelId: i % 2 ? 'channel-b' : 'channel-a', channelTitle: i % 2 ? 'Music' : 'Travel',
    likedAt: i === 1 ? null : new Date(Date.parse(OBSERVED) - i * 86400000).toISOString(),
    publishedAt: i === 2 ? null : OBSERVED, durationSeconds: i === 3 ? null : i % 3 === 0 ? 239 : i % 3 === 1 ? 240 : 1200,
    availability: { state: 'available', evidence: 'public' }, metadataFetchedAt: OBSERVED,
    description: i === 0 ? 'A quiet walk through the mountains.' : null,
    metadataFreshness: { title: freshness(), channelId: freshness(), channelTitle: freshness(), description: i === 0 ? freshness() : null,
      thumbnailUrl: null, publishedAt: i === 2 ? null : freshness(), durationSeconds: i === 3 ? null : freshness(), availability: freshness() },
  }));
}
export function optionsSnapshot(count = 62): RuntimeResult<'LIBRARY_SNAPSHOT_GET'> {
  return { revision: 1, dataGeneration: 0, authEpoch: 0, validUntil: '2026-10-15T00:00:00.000Z', lastCleanupReason: null,
    owner: owner(), videos: optionsVideos(count), sync: { currentAttempt: null, previousCompletedResult: null,
      latestSuccessfulSync: success(), lastMirrorChangeRevision: 1, lastFinalizedMirrorRevision: 1 } };
}
// Exceptional labels and a scrollable option list, isolated from production.
export function channelPickerVideos() {
  return optionsVideos(100).map((entry, index) => {
    const channelTitle = index < 2 ? 'Same name' : index < 4 ? null : index === 4 ? '<script> & "Channel"'
      : index === 5 ? `Very long channel ${'name '.repeat(35)}` : `Channel ${String(index).padStart(3, '0')}`;
    return { ...entry, channelId: `UC-${String(index).padStart(3, '0')}-same-suffix`, channelTitle,
      metadataFreshness: { ...entry.metadataFreshness, channelTitle: channelTitle === null ? null : freshness() } };
  });
}
export function optionsAuth(): RuntimeResult<'AUTH_STATUS_GET'> {
  return { status: 'authorized', bootstrap: { channelId: 'owner-a', channelTitle: 'My channel', likesPlaylistId: 'likes-owner-a' },
    ownerComparison: 'SAME_REMOTE_OWNER', control: { revision: 1, dataGeneration: 0, authEpoch: 0, connectionGate: 'connected',
      authorizationCheckDueAt: '2026-10-15T00:00:00.000Z', revocationStatus: 'not-requested', cacheInvalidationStatus: 'not-requested',
      deletionStatus: 'not-requested', pendingCleanupReason: null, lastCleanupReason: null } };
}
