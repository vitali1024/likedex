import type { MirroredVideo } from '../domain/contracts';

export const PAGE_SIZE = 50;
export const SORTS = {
  'liked-newest': 'Liked newest', 'liked-oldest': 'Liked oldest',
  'published-newest': 'Published newest', 'published-oldest': 'Published oldest',
  'duration-longest': 'Duration longest', 'duration-shortest': 'Duration shortest', 'title': 'Title A–Z',
} as const;
export type Sort = keyof typeof SORTS;
export interface LibraryQuery {
  search: string; channels: string[]; duration: '' | 'short' | 'medium' | 'long';
  dateBasis: 'likedAt' | 'publishedAt'; from: string; to: string; sort: Sort;
}
export const INITIAL_QUERY: LibraryQuery = {
  search: '', channels: [], duration: '', dateBasis: 'likedAt', from: '', to: '', sort: 'liked-newest',
};
export function normalize(text: string): string { return text.normalize('NFKC').toLowerCase().trim(); }
export function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

// Date inputs represent local calendar days. Construct the next calendar day,
// rather than adding 24h, so inclusive ranges also work across DST boundaries.
export function dateBoundary(value: string, nextDay = false): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(0); date.setFullYear(year, month - 1, day); date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.getTime();
}
export function queryLibrary(videos: readonly MirroredVideo[], query: LibraryQuery): MirroredVideo[] {
  const terms = normalize(query.search).split(/\s+/u).filter(Boolean);
  const from = dateBoundary(query.from), until = dateBoundary(query.to, true);
  const rows = videos.filter((video) => {
    if (video.availability.state !== 'available') return false;
    const text = normalize(`${video.title ?? ''} ${video.channelTitle ?? ''}`);
    if (!terms.every((term) => text.includes(term))) return false;
    if (query.channels.length && (video.channelId === null || !query.channels.includes(video.channelId))) return false;
    const duration = video.durationSeconds;
    if (query.duration && (duration === null || (query.duration === 'short' ? duration >= 240
      : query.duration === 'medium' ? duration < 240 || duration >= 1200 : duration < 1200))) return false;
    if (query.from || query.to) {
      const value = video[query.dateBasis];
      if (value === null || (query.from && from === null) || (query.to && until === null)) return false;
      const instant = Date.parse(value);
      if ((from !== null && instant < from) || (until !== null && instant >= until)) return false;
    }
    return true;
  });
  const value = (video: MirroredVideo): string | number | null => query.sort === 'title'
    ? video.title === null || normalize(video.title) === '' ? null : normalize(video.title)
    : query.sort.startsWith('duration') ? video.durationSeconds
    : query.sort.startsWith('published') ? video.publishedAt : video.likedAt;
  const direction = ['liked-newest', 'published-newest', 'duration-longest'].includes(query.sort) ? -1 : 1;
  return rows.sort((a, b) => {
    const av = value(a), bv = value(b);
    const compared = av === null ? bv === null ? 0 : 1 : bv === null ? -1
      : (av < bv ? -1 : av > bv ? 1 : 0) * direction;
    return compared || compareText(a.videoId, b.videoId);
  });
}
export function pageOf<T>(rows: readonly T[], requested: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.max(1, Math.min(pages, Number.isFinite(requested) ? Math.trunc(requested) : 1));
  return { rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages };
}
export function youtubeUrl(videoId: string): string | null {
  return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null;
}
