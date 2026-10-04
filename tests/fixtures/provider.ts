import type { IngestionContext } from '@/src/provider/youtube-ingestion';
import type { MembershipItemReason } from '@/src/provider/diagnostics';
import { bootstrap } from './authentication';

export const context: IngestionContext = { attemptId: '00000000-0000-4000-8000-000000000001',
  dataGeneration: 7, authEpoch: 3, owner: bootstrap };
export function videoId(index = 1): string { return `v${String(index).padStart(10, '0')}`; }
export function member(index = 1, id = videoId(index)) {
  return { kind: 'youtube#playlistItem', id: `source-${index}`,
    snippet: { playlistId: bootstrap.likesPlaylistId, position: index - 1,
      publishedAt: '2026-09-01T10:00:00Z', resourceId: { kind: 'youtube#video', videoId: id } },
    contentDetails: { videoId: id }, status: { privacyStatus: 'private' } };
}
export function membershipPage(items: unknown[] = [member()], nextPageToken?: string, totalResults: number | null = items.length) {
  return { kind: 'youtube#playlistItemListResponse', items,
    ...(nextPageToken === undefined ? {} : { nextPageToken }),
    pageInfo: { resultsPerPage: items.length, ...(totalResults === null ? {} : { totalResults }) } };
}
export function metadata(index = 1) {
  return { kind: 'youtube#video', id: videoId(index),
    snippet: { title: `Video ${index}`, channelId: 'creator-a', channelTitle: 'Creator', description: 'Description',
      publishedAt: '2020-01-01T00:00:00Z', thumbnails: { medium: { url: `https://i.ytimg.com/vi/${videoId(index)}/mqdefault.jpg`, width: 320, height: 180 } } },
    contentDetails: { duration: 'PT4M5S' }, status: { privacyStatus: 'public', uploadStatus: 'processed' } };
}
export function videosPage(items = [metadata()]) { return { kind: 'youtube#videoListResponse', items }; }

export const UNKNOWN_PLAYLIST_PRIVACY_STATUS = 'synthetic-unrecognized-privacy';

// Generated TEST fixture only; opaque token punctuation must survive URL encoding.
export function generatedLikesPages(total = 3547) {
  return Array.from({ length: Math.ceil(total / 50) }, (_, pageIndex) => {
    const indices = Array.from({ length: Math.min(50, total - pageIndex * 50) }, (_, index) => pageIndex * 50 + index + 1);
    const next = pageIndex + 1 < Math.ceil(total / 50) ? `opaque +/= ${pageIndex + 1} ?&` : undefined;
    return { next, membership: membershipPage(indices.map((index) => index === 367
      ? { ...member(index), status: { privacyStatus: UNKNOWN_PLAYLIST_PRIVACY_STATUS } } : member(index)), next, total),
      hydration: videosPage(indices.map((index) => metadata(index))) };
  });
}

// Every reachable schema subreason plus the three existing identity invariants.
// Synthetic values only; these do not claim any unavailable-video live shape.
export function invalidMembershipCases(): { reason: MembershipItemReason; item: unknown }[] {
  const base = member();
  return [
    { reason: 'membership-item-not-object', item: null },
    { reason: 'membership-kind-invalid', item: { ...base, kind: 'private-kind-sentinel' } },
    { reason: 'membership-playlist-item-id-missing', item: { ...base, id: undefined } },
    { reason: 'membership-playlist-item-id-invalid', item: { ...base, id: 'private.id-sentinel' } },
    { reason: 'membership-snippet-missing', item: { ...base, snippet: undefined } },
    { reason: 'membership-snippet-invalid', item: { ...base, snippet: null } },
    { reason: 'membership-playlist-id-missing', item: { ...base, snippet: { ...base.snippet, playlistId: undefined } } },
    { reason: 'membership-playlist-id-invalid', item: { ...base, snippet: { ...base.snippet, playlistId: 'private.playlist-sentinel' } } },
    { reason: 'membership-resource-id-missing', item: { ...base, snippet: { ...base.snippet, resourceId: undefined } } },
    { reason: 'membership-resource-id-invalid', item: { ...base, snippet: { ...base.snippet, resourceId: [] } } },
    { reason: 'membership-resource-kind-invalid', item: { ...base, snippet: { ...base.snippet, resourceId: { ...base.snippet.resourceId, kind: 'youtube#channel' } } } },
    { reason: 'membership-snippet-video-id-invalid', item: { ...base, snippet: { ...base.snippet, resourceId: { ...base.snippet.resourceId, videoId: 'private.video-sentinel' } } } },
    { reason: 'membership-content-details-missing', item: { ...base, contentDetails: undefined } },
    { reason: 'membership-content-details-invalid', item: { ...base, contentDetails: 'private-details-sentinel' } },
    { reason: 'membership-content-video-id-invalid', item: { ...base, contentDetails: { videoId: 'private.video-sentinel' } } },
    { reason: 'membership-liked-at-type-invalid', item: { ...base, snippet: { ...base.snippet, publishedAt: 42 } } },
    { reason: 'membership-position-invalid', item: { ...base, snippet: { ...base.snippet, position: -1 } } },
    { reason: 'membership-status-missing', item: { ...base, status: undefined } },
    { reason: 'membership-status-invalid', item: { ...base, status: null } },
    ...[42, {}, null, [], true].map((privacyStatus) => ({ reason: 'membership-privacy-status-invalid' as const,
      item: { ...base, status: { privacyStatus } } })),
    { reason: 'membership-playlist-conflict', item: { ...base, snippet: { ...base.snippet, playlistId: 'other-playlist' } } },
    { reason: 'membership-video-id-missing', item: { ...base, snippet: { ...base.snippet, resourceId: { kind: 'youtube#video' } }, contentDetails: {} } },
    { reason: 'membership-video-id-conflict', item: { ...base, contentDetails: { videoId: videoId(2) } } },
  ];
}
