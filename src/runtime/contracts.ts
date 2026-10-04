import { z } from 'zod';
import { authenticatedBootstrapSchema } from '../domain/authentication';
import { attemptStateSchema, controlSchema, errorSchema, instantSchema, ownerSchema, syncSchema, videoSchema } from '../domain/contracts';

export const operationSchema = z.enum(['AUTH_STATUS_GET', 'AUTH_CONNECT', 'AUTH_DISCONNECT',
  'LIBRARY_SNAPSHOT_GET', 'SYNC_STATUS_GET', 'SYNC_START']);
export type RuntimeOperation = z.infer<typeof operationSchema>;
export const requestSchema = z.strictObject({ protocolVersion: z.literal(1), requestId: z.uuid(),
  operation: operationSchema, payload: z.strictObject({}) });
export type RuntimeRequest = z.infer<typeof requestSchema>;
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const stateStampSchema = z.strictObject({ revision: counter, dataGeneration: counter, authEpoch: counter,
  validUntil: instantSchema.nullable(), lastCleanupReason: controlSchema.shape.lastCleanupReason });
const authorizedSchema = z.strictObject({ status: z.literal('authorized'), bootstrap: authenticatedBootstrapSchema,
  ownerComparison: z.enum(['NO_LOCAL_OWNER', 'SAME_REMOTE_OWNER']) });
const mismatchSchema = z.strictObject({ status: z.literal('owner-mismatch'), bootstrap: authenticatedBootstrapSchema,
  localOwnerChannelId: z.string().min(1) });
const authResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('auth-required') }), authorizedSchema, mismatchSchema,
  z.strictObject({ status: z.literal('validation-pending') }),
]);
export const authControlSchema = z.strictObject({ revision: counter, dataGeneration: counter, authEpoch: counter,
  connectionGate: controlSchema.shape.connectionGate, authorizationCheckDueAt: controlSchema.shape.authorizationCheckDueAt,
  revocationStatus: controlSchema.shape.revocationStatus, cacheInvalidationStatus: controlSchema.shape.cacheInvalidationStatus,
  deletionStatus: controlSchema.shape.deletionStatus, pendingCleanupReason: controlSchema.shape.pendingCleanupReason,
  lastCleanupReason: controlSchema.shape.lastCleanupReason });
const authStatusSchema = z.discriminatedUnion('status', [
  authResultSchema.options[0].extend({ control: authControlSchema }),
  authorizedSchema.extend({ control: authControlSchema }), mismatchSchema.extend({ control: authControlSchema }),
  authResultSchema.options[3].extend({ control: authControlSchema }),
]);
const disconnectSchema = z.strictObject({ completed: z.boolean(), revocation: z.enum(['succeeded', 'failed', 'unconfirmed']),
  cacheInvalidation: z.enum(['succeeded', 'failed']), fencing: z.enum(['succeeded', 'failed']),
  deletion: z.enum(['succeeded', 'failed']), statusPersistence: z.enum(['succeeded', 'failed']), error: errorSchema.nullable(),
}).refine((value) => value.completed === (value.revocation === 'succeeded' && value.cacheInvalidation === 'succeeded'
  && value.fencing === 'succeeded' && value.deletion === 'succeeded' && value.statusPersistence === 'succeeded'));
const attemptIdentitySchema = z.strictObject({ attemptId: z.uuid(), state: attemptStateSchema });
export const resultSchemas = {
  AUTH_STATUS_GET: authStatusSchema,
  AUTH_CONNECT: z.discriminatedUnion('status', [authorizedSchema, mismatchSchema]),
  AUTH_DISCONNECT: disconnectSchema,
  LIBRARY_SNAPSHOT_GET: z.strictObject({ ...stateStampSchema.shape, owner: ownerSchema.nullable(),
    videos: z.array(videoSchema), sync: syncSchema.nullable() }),
  SYNC_STATUS_GET: z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('validation-pending'), revision: counter,
      dataGeneration: counter, authEpoch: counter, attempt: attemptIdentitySchema.nullable() }),
    z.strictObject({ status: z.literal('observed'), ...stateStampSchema.shape, sync: syncSchema.nullable() }),
  ]),
  SYNC_START: z.strictObject({ status: z.enum(['started', 'already-active']), attempt: attemptIdentitySchema }),
} as const;
export type RuntimeResult<K extends RuntimeOperation> = z.infer<(typeof resultSchemas)[K]>;
export const failureSchema = z.strictObject({ code: z.enum(['invalid-request', 'forbidden', 'provider-validation-required',
  'storage-error', 'auth-error', 'authorization-pending', 'data-unavailable', 'recovery-error', 'internal-error',
  'transport-error', 'protocol-error']), detail: errorSchema.nullable(),
  cleanup: z.strictObject({ deletion: z.enum(['succeeded', 'failed']), cacheInvalidation: z.enum(['succeeded', 'failed']),
    persistence: z.enum(['succeeded', 'failed']) }).nullable() });
export type RuntimeFailure = z.infer<typeof failureSchema>;
export type ClientResult<K extends RuntimeOperation> = { ok: true; result: RuntimeResult<K> }
  | { ok: false; error: RuntimeFailure };
export interface RuntimeResponse { protocolVersion: 1; requestId: string | null; operation: RuntimeOperation | null;
  ok: boolean; result?: unknown; error?: RuntimeFailure }
export const responseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ protocolVersion: z.literal(1), requestId: z.uuid(), operation: operationSchema,
    ok: z.literal(true), result: z.unknown() }),
  z.strictObject({ protocolVersion: z.literal(1), requestId: z.uuid().nullable(), operation: operationSchema.nullable(),
    ok: z.literal(false), error: failureSchema }),
]);
export const revisionSchema = z.strictObject({ protocolVersion: z.literal(1), event: z.literal('STATE_REVISION'),
  revision: counter, dataGeneration: counter, authEpoch: counter });
export type RevisionEvent = z.infer<typeof revisionSchema>;
export function failure(code: RuntimeFailure['code'], detail: RuntimeFailure['detail'] = null,
  cleanup: RuntimeFailure['cleanup'] = null): RuntimeFailure { return { code, detail, cleanup }; }
