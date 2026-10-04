import { AuthenticationError } from '../auth/errors';
import type { DomainError } from '../domain/contracts';

const codes = {
  'malformed-response': ['malformed-provider', 'provider-invalid'],
  'unmappable-membership': ['untrusted-enumeration', 'enumeration-untrusted'],
  'pagination-integrity': ['untrusted-enumeration', 'enumeration-untrusted'],
  'duplicate-source': ['untrusted-enumeration', 'enumeration-untrusted'],
  'count-integrity': ['untrusted-enumeration', 'enumeration-untrusted'],
  'invalid-context': ['internal', 'unexpected-error'],
  unexpected: ['internal', 'unexpected-error'],
} as const satisfies Record<string, readonly [DomainError['category'], DomainError['messageKey']]>;

export class ProviderError extends Error {
  readonly detail: DomainError;
  constructor(readonly code: keyof typeof codes) {
    super(`Likedex provider: ${code}`);
    this.name = 'ProviderError';
    const [category, messageKey] = codes[code];
    this.detail = { category, messageKey, phase: 'scanning' };
  }
}

export function providerFailure(error: unknown): ProviderError | AuthenticationError {
  if (error instanceof ProviderError) return error;
  if (error instanceof AuthenticationError) {
    // Retain approved auth/transport codes; annotate the ingestion phase.
    const failure = new AuthenticationError(error.code);
    failure.detail.phase = 'scanning';
    return failure;
  }
  return new ProviderError('unexpected');
}
