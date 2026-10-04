import type { DomainError } from '../domain/contracts';
import { z } from 'zod';

const errors = {
  'auth-required': ['authentication', 'connect-required'],
  'permission-denied': ['permission', 'permission-denied'],
  'oauth-configuration': ['oauth-configuration', 'configuration-error'],
  network: ['network', 'network-failed'],
  'fetch-invocation': ['internal', 'unexpected-error'],
  'request-timeout': ['network', 'network-failed'],
  unavailable: ['provider', 'provider-failed'],
  quota: ['quota', 'quota-exhausted'],
  'rate-limit': ['rate-limit', 'rate-limited'],
  'malformed-bootstrap': ['malformed-provider', 'provider-invalid'],
  'malformed-provider': ['malformed-provider', 'provider-invalid'],
  'request-budget': ['provider', 'provider-failed'],
  'identity-missing': ['identity', 'identity-unavailable'],
  'likes-playlist-missing': ['identity', 'identity-unavailable'],
  'owner-mismatch': ['owner-mismatch', 'owner-mismatch'],
  'revocation-failed': ['authentication', 'connect-required'],
  'cache-invalidation-failed': ['authentication', 'connect-required'],
  storage: ['persistence', 'storage-failed'],
  cancelled: ['interrupted', 'worker-interrupted'],
  busy: ['interrupted', 'worker-interrupted'],
  unexpected: ['internal', 'unexpected-error'],
} as const satisfies Record<string, readonly [DomainError['category'], DomainError['messageKey']]>;
export type AuthenticationErrorCode = keyof typeof errors;

// Closed allowlist: never serialize an exception, URL, header or provider body.
export const authenticationDiagnosticSchema = z.strictObject({
  phase: z.enum(['oauth-token', 'bootstrap-fetch', 'bootstrap-http', 'bootstrap-parse', 'bootstrap-validate',
    'provider-fetch', 'provider-http', 'provider-parse', 'runtime']),
  endpoint: z.enum(['youtube.channels.list', 'youtube.playlistItems.list', 'youtube.videos.list']).nullable(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  errorCode: z.enum(Object.keys(errors) as [AuthenticationErrorCode, ...AuthenticationErrorCode[]]),
  retryOccurred: z.boolean(),
});
export type AuthenticationDiagnostic = z.infer<typeof authenticationDiagnosticSchema>;
type DiagnosticContext = Omit<AuthenticationDiagnostic, 'errorCode'>;

export class AuthenticationError extends Error {
  readonly detail: DomainError;
  readonly diagnostic: AuthenticationDiagnostic | undefined;
  constructor(readonly code: AuthenticationErrorCode, context?: DiagnosticContext) {
    super(`Likedex authentication: ${code}`);
    this.name = 'AuthenticationError';
    const [category, messageKey] = errors[code];
    this.detail = { category, messageKey, phase: 'preparing' };
    this.diagnostic = context ? authenticationDiagnosticSchema.parse({ ...context, errorCode: code }) : undefined;
  }
}
export function sanitizedFailure(error: unknown): AuthenticationError {
  if (error instanceof AuthenticationError) return error;
  return new AuthenticationError('unexpected');
}
export function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new AuthenticationError('cancelled');
}

// Chrome rejects with strings/messages rather than stable error codes. Match
// recognized categories locally; never retain the original exception or message.
export function classifyIdentityFailure(error: unknown, interactive: boolean): AuthenticationError {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  if (/invalid[_ ]client|bad client id|invalid client id|oauth2.*(configuration|client)|not configured/i.test(message)) {
    return new AuthenticationError('oauth-configuration');
  }
  if (/network|connection|offline/i.test(message)) return new AuthenticationError('network');
  if (/cancel|denied|did not approve|access_denied/i.test(message)) return new AuthenticationError('permission-denied');
  if (/not signed in|not granted|login required|interaction required|invalid[_ ]grant|auth.*required/i.test(message)) {
    return new AuthenticationError('auth-required');
  }
  // Unknown Chrome failures stay unknown; they are not empty authorization.
  return new AuthenticationError(interactive && /consent/i.test(message) ? 'permission-denied' : 'unexpected');
}
