import { z } from 'zod';
import { ProviderError } from './errors';
import type { MembershipItemDiagnostic, MembershipItemReason } from './diagnostics';

export const identifierSchema = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/);
export const videoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const privacy = z.enum(['public', 'unlisted', 'private']);
const timestamp = z.string(); // Absent/unusable date strings map to unknown.

const playlistItem = z.object({
  kind: z.literal('youtube#playlistItem'), id: identifierSchema,
  snippet: z.object({
    playlistId: identifierSchema,
    resourceId: z.object({ kind: z.literal('youtube#video'), videoId: videoIdSchema.optional() }),
    publishedAt: timestamp.optional(), position: count.optional(),
  }),
  contentDetails: z.object({ videoId: videoIdSchema.optional() }),
  status: z.object({ privacyStatus: privacy.optional() }),
});
const playlistEnvelope = z.object({
  kind: z.literal('youtube#playlistItemListResponse'), items: z.array(z.unknown()).max(50),
  error: z.never().optional(),
  nextPageToken: z.string().min(1).optional(),
  pageInfo: z.object({ totalResults: count.optional(), resultsPerPage: count.max(50) }),
});
export interface Membership {
  sourceId: string;
  videoId: string;
  likedAt: string | null;
  position: number | null;
}

export function canonicalTimestamp(value: string | undefined): string | null {
  if (value === undefined || !z.iso.datetime({ offset: true }).safeParse(value).success) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function objectFields(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
// Fixed paths/reasons only. Zod messages, issue payloads and provider values
// never leave this boundary; unknown future schema paths have a safe fallback.
function itemSchemaReasons(issues: readonly z.core.$ZodIssue[], raw: unknown): MembershipItemReason[] {
  const item = objectFields(raw); const snippet = objectFields(item.snippet);
  return [...new Set(issues.map((issue): MembershipItemReason => {
    switch (issue.path.join('.')) {
      case '': return 'membership-item-not-object';
      case 'kind': return 'membership-kind-invalid';
      case 'id': return item.id === undefined ? 'membership-playlist-item-id-missing' : 'membership-playlist-item-id-invalid';
      case 'snippet': return item.snippet === undefined ? 'membership-snippet-missing' : 'membership-snippet-invalid';
      case 'snippet.playlistId': return snippet.playlistId === undefined ? 'membership-playlist-id-missing' : 'membership-playlist-id-invalid';
      case 'snippet.resourceId': return snippet.resourceId === undefined ? 'membership-resource-id-missing' : 'membership-resource-id-invalid';
      case 'snippet.resourceId.kind': return 'membership-resource-kind-invalid';
      case 'snippet.resourceId.videoId': return 'membership-snippet-video-id-invalid';
      case 'snippet.publishedAt': return 'membership-liked-at-type-invalid';
      case 'snippet.position': return 'membership-position-invalid';
      case 'contentDetails': return item.contentDetails === undefined ? 'membership-content-details-missing' : 'membership-content-details-invalid';
      case 'contentDetails.videoId': return 'membership-content-video-id-invalid';
      case 'status': return item.status === undefined ? 'membership-status-missing' : 'membership-status-invalid';
      case 'status.privacyStatus': return 'membership-privacy-status-invalid';
      default: return 'membership-schema-invalid';
    }
  }))];
}

function itemDiagnostic(raw: unknown, playlistId: string, itemOrdinal: number,
  reasonCodes: MembershipItemReason[]): Omit<MembershipItemDiagnostic, 'pageOrdinal'> {
  const item = objectFields(raw); const snippet = objectFields(item.snippet);
  const resource = objectFields(snippet.resourceId); const details = objectFields(item.contentDetails);
  const status = objectFields(item.status);
  const present = (value: unknown) => value !== undefined;
  const valid = (value: unknown, schema: z.ZodType) => value === undefined ? null : schema.safeParse(value).success;
  return { itemOrdinal, reasonCodes, fieldPresence: {
    itemKind: present(item.kind), playlistItemId: present(item.id), snippet: present(item.snippet),
    playlistId: present(snippet.playlistId), resourceId: present(snippet.resourceId), resourceKind: present(resource.kind),
    snippetVideoId: present(resource.videoId), contentDetails: present(item.contentDetails), contentVideoId: present(details.videoId),
    publishedAt: present(snippet.publishedAt), position: present(snippet.position), status: present(item.status), privacyStatus: present(status.privacyStatus),
  }, itemKindIsPlaylistItem: item.kind === undefined ? null : item.kind === 'youtube#playlistItem',
  playlistItemIdValid: valid(item.id, identifierSchema), playlistIdValid: valid(snippet.playlistId, identifierSchema),
  resourceKindIsVideo: resource.kind === undefined ? null : resource.kind === 'youtube#video',
  snippetVideoIdValid: valid(resource.videoId, videoIdSchema), contentVideoIdValid: valid(details.videoId, videoIdSchema),
  videoIdsAgree: typeof resource.videoId === 'string' && typeof details.videoId === 'string' ? resource.videoId === details.videoId : null,
  playlistIdMatchesExpected: typeof snippet.playlistId === 'string' ? snippet.playlistId === playlistId : null,
  likedAtParses: snippet.publishedAt === undefined ? null : typeof snippet.publishedAt === 'string' && canonicalTimestamp(snippet.publishedAt) !== null,
  positionValid: valid(snippet.position, count), privacyStatusRecognized: valid(status.privacyStatus, privacy) };
}

// Internal envelope hook runs before trust checks, so a rejected page can be
// diagnosed. Its opaque token stays inside ingestion; only safe facts leave it.
export function validateMembershipPage(value: unknown, playlistId: string,
  envelopeObserved?: (page: z.infer<typeof playlistEnvelope>) => void,
  itemObserved?: (item: Omit<MembershipItemDiagnostic, 'pageOrdinal'>) => void) {
  const envelope = playlistEnvelope.safeParse(value);
  if (!envelope.success) throw new ProviderError('malformed-response');
  const page = envelope.data;
  envelopeObserved?.(page);
  if (page.pageInfo.resultsPerPage !== page.items.length) throw new ProviderError('count-integrity', 'pagination-page-count-mismatch');
  const memberships: Membership[] = [];
  let firstFailure: ProviderError | undefined;
  const rejectItem = (raw: unknown, index: number, reason: MembershipItemReason | 'membership-item-invalid',
    issues?: readonly z.core.$ZodIssue[]) => {
    if (itemObserved) {
      const reasons = issues ? itemSchemaReasons(issues, raw)
        : [reason === 'membership-item-invalid' ? 'membership-schema-invalid' : reason];
      itemObserved(itemDiagnostic(raw, playlistId, index + 1, reasons));
      reason = reasons[0]!;
    }
    const failure = new ProviderError('unmappable-membership', reason);
    if (!itemObserved) throw failure; // Preserve production's immediate failure.
    firstFailure ??= failure;
  };
  for (const [index, raw] of page.items.entries()) {
    const result = playlistItem.safeParse(raw);
    if (!result.success) { rejectItem(raw, index, 'membership-item-invalid', result.error.issues); continue; }
    const item = result.data;
    const snippetId = item.snippet.resourceId.videoId;
    const detailsId = item.contentDetails.videoId;
    const reason = item.snippet.playlistId !== playlistId ? 'membership-playlist-conflict'
      : snippetId === undefined && detailsId === undefined ? 'membership-video-id-missing'
        : snippetId !== undefined && detailsId !== undefined && snippetId !== detailsId ? 'membership-video-id-conflict' : null;
    if (reason) { rejectItem(raw, index, reason); continue; }
    memberships.push({ sourceId: item.id, videoId: snippetId ?? detailsId!,
      likedAt: canonicalTimestamp(item.snippet.publishedAt), position: item.snippet.position ?? null });
  }
  // Validation-only collection never skips bad membership to return a page.
  if (firstFailure) throw firstFailure;
  return { memberships, nextPageToken: page.nextPageToken,
    estimatedTotal: page.pageInfo.totalResults ?? null };
}

const thumbnail = z.object({ url: z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && url.hostname === 'i.ytimg.com' && url.port === ''
    && url.username === '' && url.password === '';
}), width: count.optional(), height: count.optional() });
const video = z.object({
  kind: z.literal('youtube#video'), id: videoIdSchema,
  snippet: z.object({
    title: z.string().optional(), channelId: identifierSchema.optional(), channelTitle: z.string().optional(),
    description: z.string().optional(), publishedAt: timestamp.optional(),
    thumbnails: z.object({ default: thumbnail.optional(), medium: thumbnail.optional(),
      high: thumbnail.optional(), standard: thumbnail.optional(), maxres: thumbnail.optional(),
      qhd: thumbnail.optional(), uhd: thumbnail.optional() }).optional(),
  }),
  contentDetails: z.object({ duration: z.string().optional() }),
  status: z.object({ privacyStatus: privacy.optional(),
    uploadStatus: z.enum(['deleted', 'failed', 'processed', 'rejected', 'uploaded']).optional() }),
});
export type VideoMetadata = z.infer<typeof video>;
const videoEnvelope = z.object({ kind: z.literal('youtube#videoListResponse'), items: z.array(video).max(50),
  error: z.never().optional(), nextPageToken: z.never().optional() });

export function validateVideos(value: unknown, requestedIds: readonly string[]): Map<string, VideoMetadata> {
  const response = videoEnvelope.safeParse(value);
  if (!response.success) throw new ProviderError('malformed-response');
  const requested = new Set(requestedIds);
  const metadata = new Map<string, VideoMetadata>();
  for (const item of response.data.items) {
    if (!requested.has(item.id) || metadata.has(item.id)) throw new ProviderError('malformed-response');
    metadata.set(item.id, item);
  }
  return metadata;
}

// Fixed-unit YouTube forms, including day-long videos; calendar years/months
// cannot be normalized safely. Unsupported/invalid strings remain unknown.
export function durationSeconds(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (match === null || match.slice(2).every((part) => part === undefined)) return null;
  const seconds = Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600
    + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
  return Number.isFinite(seconds) && seconds <= Number.MAX_SAFE_INTEGER ? seconds : null;
}

export function bestThumbnail(metadata: VideoMetadata): string | null {
  const thumbnails = metadata.snippet.thumbnails;
  return thumbnails?.uhd?.url ?? thumbnails?.qhd?.url ?? thumbnails?.maxres?.url ?? thumbnails?.standard?.url ?? thumbnails?.high?.url
    ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;
}
