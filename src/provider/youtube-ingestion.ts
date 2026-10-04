import { z } from 'zod';
import type { GoogleAuthorizationRequests, YouTubeReadSession } from '../auth/google-requests';
import { authenticatedBootstrapSchema } from '../domain/authentication';
import { videoSchema, type Freshness, type MirroredVideo } from '../domain/contracts';
import { retentionDeadline } from '../domain/freshness';
import { ProviderError, providerFailure } from './errors';
import type { MembershipPageDiagnostic } from './diagnostics';
import { bestThumbnail, durationSeconds, canonicalTimestamp, validateMembershipPage, validateVideos,
  type Membership, type VideoMetadata } from './youtube-schemas';

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const contextSchema = z.strictObject({ attemptId: z.uuid(), dataGeneration: counter, authEpoch: counter,
  owner: authenticatedBootstrapSchema });
export type IngestionContext = z.infer<typeof contextSchema>;
export interface ProviderProgress {
  pagesAccepted: number;
  rawItems: number;
  uniqueMembership: number;
  duplicateVideoItems: number;
  estimatedTotal: number | null;
}
export interface ProviderPage {
  kind: 'page';
  pageNumber: number;
  terminal: boolean;
  records: MirroredVideo[];
  progress: ProviderProgress;
}
export interface AcceptedPageEvidence {
  pageNumber: number;
  rawItems: number;
  observedAt: string;
  terminal: boolean;
}
declare const completionBrand: unique symbol;
export interface TrustedProviderCompletion {
  readonly [completionBrand]: true;
  readonly kind: 'trusted-complete';
  readonly scope: Readonly<{ attemptId: string; ownerChannelId: string; likesPlaylistId: string;
    dataGeneration: number; authEpoch: number }>;
  readonly validatorRevision: 1;
  readonly progress: Readonly<ProviderProgress>;
  readonly membershipVideoIds: readonly string[];
  readonly pageChain: readonly Readonly<AcceptedPageEvidence>[];
  readonly terminalPageObservedAt: string;
}
const completions = new WeakSet<object>();
// Provenance check for in-process Phase 5 consumption. Serialized summaries or
// structural booleans are audit data, not authority. Storage gates remain Phase 5.
export function isTrustedProviderCompletion(value: unknown): value is TrustedProviderCompletion {
  return typeof value === 'object' && value !== null && completions.has(value);
}
export type ProviderEvent = ProviderPage | TrustedProviderCompletion;
type Requests = Pick<GoogleAuthorizationRequests, 'createYouTubeReadSession'>;

function freshness(observedAt: string): Freshness {
  return { observedAt, expiresAt: retentionDeadline(observedAt) };
}
function availability(metadata: VideoMetadata | undefined): MirroredVideo['availability'] {
  if (metadata === undefined) return { state: 'unknown', evidence: 'lookup-omitted' };
  const { privacyStatus, uploadStatus } = metadata.status;
  if (uploadStatus === 'deleted' || uploadStatus === 'rejected') return { state: 'unavailable', evidence: uploadStatus };
  if (privacyStatus === 'private') return { state: 'unavailable', evidence: 'private' };
  if (uploadStatus === 'processed' && (privacyStatus === 'public' || privacyStatus === 'unlisted')) {
    return { state: 'available', evidence: privacyStatus };
  }
  return { state: 'unknown', evidence: 'unknown' };
}

function mapRecord(member: Membership, sourceIds: string[], metadata: VideoMetadata | undefined,
  membershipAt: string, metadataAt: string, context: IngestionContext): MirroredVideo {
  const snippet = metadata?.snippet;
  const observed = freshness(metadataAt);
  const title = snippet?.title ?? null;
  const channelId = snippet?.channelId ?? null;
  const channelTitle = snippet?.channelTitle ?? null;
  const description = snippet?.description ?? null;
  const thumbnailUrl = metadata === undefined ? null : bestThumbnail(metadata);
  const publishedAt = canonicalTimestamp(snippet?.publishedAt);
  const duration = durationSeconds(metadata?.contentDetails.duration);
  const state = availability(metadata);
  const lineage = {
    title: title === null ? null : observed,
    channelId: channelId === null ? null : observed,
    channelTitle: channelTitle === null ? null : observed,
    description: description === null ? null : observed,
    thumbnailUrl: thumbnailUrl === null ? null : observed,
    publishedAt: publishedAt === null ? null : observed,
    durationSeconds: duration === null ? null : observed,
    availability: state.evidence === 'unknown' ? null : observed,
  };
  return videoSchema.parse({ videoId: member.videoId, ownerChannelId: context.owner.channelId,
    membershipSourceIds: sourceIds, lastSeenAttemptId: context.attemptId,
    title, channelId, channelTitle, description, thumbnailUrl, likedAt: member.likedAt,
    publishedAt, durationSeconds: duration, availability: state,
    membershipObservedAt: membershipAt, membershipFreshness: freshness(membershipAt),
    metadataFetchedAt: Object.values(lineage).some((fact) => fact !== null) ? metadataAt : null,
    metadataFreshness: lineage });
}

export class YouTubeLikedVideosProvider {
  constructor(private readonly requests: Requests,
    private readonly observePage?: (page: MembershipPageDiagnostic | null) => void) {}

  // A page authorizes only prospective safe updates. Returning early, aborting,
  // or any failure leaves the caller without a terminal completeness capability.
  async *enumerateLikedVideos(input: IngestionContext, signal: AbortSignal,
    sharedSession?: YouTubeReadSession): AsyncGenerator<ProviderEvent, void, void> {
    try {
      const parsed = contextSchema.safeParse(input);
      if (!parsed.success) throw new ProviderError('invalid-context');
      const context = parsed.data;
      const session = sharedSession ?? this.requests.createYouTubeReadSession(context.owner, signal);
      const tokens = new Set<string>();
      const sources = new Set<string>();
      const canonical = new Map<string, { member: Membership; sourceIds: string[]; observedAt: string }>();
      const chain: AcceptedPageEvidence[] = [];
      let next: string | undefined;
      let total: number | null = null;
      let rawItems = 0;
      let pages = 0;
      for (;;) {
        session.assertActive();
        // Null marks a new request whose response facts are not yet validated.
        this.observePage?.(null);
        let diagnostic: MembershipPageDiagnostic | undefined;
        const page = await session.playlistItems(next, (body) => validateMembershipPage(body, context.owner.likesPlaylistId, (envelope) => {
          if (!this.observePage) return;
          const token = envelope.nextPageToken;
          diagnostic = { pageOrdinal: pages + 1, itemCount: envelope.items.length,
            totalResults: envelope.pageInfo.totalResults ?? null, resultsPerPage: envelope.pageInfo.resultsPerPage,
            hadNextPageToken: token !== undefined, tokenRelation: token === undefined ? 'none'
              : token === next ? 'repeated' : tokens.has(token) ? 'cyclic' : pages === 0 ? 'first' : 'fresh',
            hydrationRequestedCount: null, hydrationReturnedCount: null };
          this.observePage?.({ ...diagnostic });
        }));
        const membershipAt = session.observedAt();
        if (page.nextPageToken !== undefined) {
          if (tokens.has(page.nextPageToken)) throw new ProviderError('pagination-integrity',
            page.nextPageToken === next ? 'pagination-token-repeat' : 'pagination-token-cycle');
          if (page.memberships.length === 0) throw new ProviderError('pagination-integrity', 'pagination-empty-continuation');
          tokens.add(page.nextPageToken);
        }
        if (page.estimatedTotal !== null) {
          if (total !== null && total !== page.estimatedTotal) throw new ProviderError('count-integrity', 'pagination-total-changed');
          total = page.estimatedTotal;
        }
        rawItems += page.memberships.length;
        if (!Number.isSafeInteger(rawItems)) throw new ProviderError('count-integrity', 'pagination-count-overflow');
        if (total !== null && rawItems > total) throw new ProviderError('count-integrity', 'pagination-count-exceeds-total');
        const terminal = page.nextPageToken === undefined;
        if (terminal && total !== null && rawItems !== total) throw new ProviderError('count-integrity', 'pagination-premature-terminal');
        // A zero total is required for the trusted-empty control case.
        if (terminal && rawItems === 0 && total !== 0) throw new ProviderError('count-integrity', 'pagination-empty-total-unconfirmed');
        const pageIds = new Set<string>();
        for (const member of page.memberships) {
          if (sources.has(member.sourceId)) throw new ProviderError('duplicate-source');
          sources.add(member.sourceId);
          const previous = canonical.get(member.videoId);
          if (previous) previous.sourceIds.push(member.sourceId);
          else canonical.set(member.videoId, { member, sourceIds: [member.sourceId], observedAt: membershipAt });
          pageIds.add(member.videoId);
        }
        const ids = [...pageIds];
        if (diagnostic) {
          diagnostic.hydrationRequestedCount = ids.length;
          this.observePage?.({ ...diagnostic });
        }
        const metadata = ids.length === 0 ? new Map<string, VideoMetadata>()
          : await session.videos(ids, (body) => validateVideos(body, ids));
        if (diagnostic) {
          diagnostic.hydrationReturnedCount = metadata.size;
          this.observePage?.({ ...diagnostic });
        }
        const metadataAt = session.observedAt();
        const records = ids.map((id) => {
          const entry = canonical.get(id)!;
          return mapRecord(entry.member, [...entry.sourceIds], metadata.get(id), entry.observedAt, metadataAt, context);
        });
        pages++;
        const progress: ProviderProgress = { pagesAccepted: pages, rawItems, uniqueMembership: canonical.size,
          duplicateVideoItems: rawItems - canonical.size, estimatedTotal: total };
        chain.push({ pageNumber: pages, rawItems: page.memberships.length, observedAt: membershipAt, terminal });
        yield { kind: 'page', pageNumber: pages, terminal, records, progress: { ...progress } };
        // Includes time spent while the consumer applies this page; it cannot
        // turn a paused/cancelled stream into a completed scan.
        session.assertActive();
        if (terminal) {
          const completion = Object.freeze({ kind: 'trusted-complete' as const,
            scope: Object.freeze({ attemptId: context.attemptId, ownerChannelId: context.owner.channelId,
              likesPlaylistId: context.owner.likesPlaylistId, dataGeneration: context.dataGeneration, authEpoch: context.authEpoch }),
            validatorRevision: 1 as const, progress: Object.freeze({ ...progress }),
            membershipVideoIds: Object.freeze([...canonical.keys()]),
            pageChain: Object.freeze(chain.map((entry) => Object.freeze({ ...entry }))),
            terminalPageObservedAt: membershipAt }) as TrustedProviderCompletion;
          completions.add(completion);
          yield completion;
          return;
        }
        next = page.nextPageToken;
      }
    } catch (error) { throw providerFailure(error); }
  }
}
