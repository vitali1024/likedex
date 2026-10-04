import { z } from 'zod';

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// Evidence only; never a completion capability. No provider identifiers or tokens.
export const membershipPageDiagnosticSchema = z.strictObject({
  pageOrdinal: counter.min(1), itemCount: counter.max(50), totalResults: counter.nullable(),
  resultsPerPage: counter.max(50), hadNextPageToken: z.boolean(),
  tokenRelation: z.enum(['first', 'fresh', 'repeated', 'cyclic', 'none']),
  hydrationRequestedCount: counter.max(50).nullable(), hydrationReturnedCount: counter.max(50).nullable(),
});
export type MembershipPageDiagnostic = z.infer<typeof membershipPageDiagnosticSchema>;
export const membershipItemReasonSchema = z.enum([
  'membership-item-not-object', 'membership-kind-invalid',
  'membership-playlist-item-id-missing', 'membership-playlist-item-id-invalid',
  'membership-snippet-missing', 'membership-snippet-invalid',
  'membership-playlist-id-missing', 'membership-playlist-id-invalid',
  'membership-resource-id-missing', 'membership-resource-id-invalid', 'membership-resource-kind-invalid',
  'membership-snippet-video-id-invalid', 'membership-content-details-missing', 'membership-content-details-invalid',
  'membership-content-video-id-invalid', 'membership-liked-at-type-invalid', 'membership-position-invalid',
  'membership-status-missing', 'membership-status-invalid', 'membership-privacy-status-invalid',
  'membership-schema-invalid', 'membership-playlist-conflict', 'membership-video-id-missing', 'membership-video-id-conflict',
]);
export type MembershipItemReason = z.infer<typeof membershipItemReasonSchema>;
export const membershipItemDiagnosticSchema = z.strictObject({
  pageOrdinal: counter.min(1), itemOrdinal: counter.min(1).max(50),
  reasonCodes: z.array(membershipItemReasonSchema).min(1).max(24),
  fieldPresence: z.strictObject({
    itemKind: z.boolean(), playlistItemId: z.boolean(), snippet: z.boolean(), playlistId: z.boolean(),
    resourceId: z.boolean(), resourceKind: z.boolean(), snippetVideoId: z.boolean(), contentDetails: z.boolean(),
    contentVideoId: z.boolean(), publishedAt: z.boolean(), position: z.boolean(), status: z.boolean(), privacyStatus: z.boolean(),
  }),
  itemKindIsPlaylistItem: z.boolean().nullable(), playlistItemIdValid: z.boolean().nullable(),
  playlistIdValid: z.boolean().nullable(), resourceKindIsVideo: z.boolean().nullable(),
  snippetVideoIdValid: z.boolean().nullable(), contentVideoIdValid: z.boolean().nullable(),
  videoIdsAgree: z.boolean().nullable(), playlistIdMatchesExpected: z.boolean().nullable(),
  // Recognition is a metadata fact, not a membership trust gate. A tolerated
  // unfamiliar string can be false here when another field rejects the item.
  likedAtParses: z.boolean().nullable(), positionValid: z.boolean().nullable(), privacyStatusRecognized: z.boolean().nullable(),
});
export type MembershipItemDiagnostic = z.infer<typeof membershipItemDiagnosticSchema>;
export const providerReasonSchema = z.enum([
  'malformed-response', 'membership-item-invalid', ...membershipItemReasonSchema.options,
  'pagination-token-repeat', 'pagination-token-cycle', 'pagination-empty-continuation',
  'pagination-page-count-mismatch', 'pagination-total-changed', 'pagination-count-overflow',
  'pagination-count-exceeds-total', 'pagination-premature-terminal', 'pagination-count-mismatch',
  'pagination-empty-total-unconfirmed', 'membership-source-duplicate',
  'completion-proof-invalid', 'completion-proof-missing', 'invalid-context', 'unexpected',
]);
export type ProviderReason = z.infer<typeof providerReasonSchema>;
