import { z } from 'zod';
import { errorSchema } from '../../src/domain/contracts';

export const VALIDATION_PORT = 'likedex-release-provider-observation-v1';
export const startSchema = z.strictObject({ operation: z.literal('OBSERVE_PROVIDER') });
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const summarySchema = z.strictObject({
  mode: z.literal('observation-only'), productionSyncGate: z.literal('closed'),
  bootstrapValidated: z.boolean(), trustedCompletion: z.boolean(),
  pages: counter, rawMemberships: counter, uniqueMemberships: counter, duplicateVideoItems: counter,
  estimatedTotal: counter.nullable(), hydrationPages: counter, hydrated: counter,
  lookupOmitted: counter, withoutRichMetadata: counter, unavailable: counter, unknownAvailability: counter,
});
export type ValidationSummary = z.infer<typeof summarySchema>;
export const resultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('success'), summary: summarySchema.extend({ trustedCompletion: z.literal(true) }) }),
  z.strictObject({ status: z.literal('failed'), summary: summarySchema.extend({ trustedCompletion: z.literal(false) }),
    error: errorSchema }),
]);
export type ValidationResult = z.infer<typeof resultSchema>;
export const eventSchema = z.discriminatedUnion('event', [
  z.strictObject({ event: z.literal('progress'), summary: summarySchema }),
  z.strictObject({ event: z.literal('result'), result: resultSchema }),
]);
