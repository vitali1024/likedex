import type { IngestionContext } from '@/src/provider/youtube-ingestion';
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
export function membershipPage(items = [member()], nextPageToken?: string, totalResults: number | null = items.length) {
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
