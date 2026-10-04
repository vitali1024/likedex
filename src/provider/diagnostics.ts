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
export const providerReasonSchema = z.enum([
  'malformed-response', 'membership-item-invalid', 'membership-playlist-conflict',
  'membership-video-id-missing', 'membership-video-id-conflict',
  'pagination-token-repeat', 'pagination-token-cycle', 'pagination-empty-continuation',
  'pagination-page-count-mismatch', 'pagination-total-changed', 'pagination-count-overflow',
  'pagination-count-exceeds-total', 'pagination-premature-terminal', 'pagination-count-mismatch',
  'pagination-empty-total-unconfirmed', 'membership-source-duplicate',
  'completion-proof-invalid', 'completion-proof-missing', 'invalid-context', 'unexpected',
]);
export type ProviderReason = z.infer<typeof providerReasonSchema>;
