import type { DomainError, SyncAttempt } from '../domain/contracts';
import type { RuntimeFailure } from '../runtime/contracts';

export const ERROR_MESSAGES: Record<DomainError['category'], string> = {
  authentication: 'YouTube authorization is required. Connect YouTube to continue.',
  'authorization-unverified': 'YouTube access could not be verified. Restore your connection, then connect again.',
  permission: 'Read-only permission was denied or cancelled. You can try Connect again.',
  'oauth-configuration': 'YouTube connection is not configured correctly in this build. Contact the maintainer.',
  'owner-mismatch': 'The connected channel differs from the local library owner. Sync is blocked.',
  identity: 'A single YouTube channel could not be established. Check your channel selection and reconnect.',
  quota: 'YouTube’s API quota is exhausted. Wait before trying again.',
  'rate-limit': 'YouTube is limiting requests. Wait before trying again.',
  provider: 'YouTube could not complete the request. Try again later.',
  network: 'The network request failed. Check your connection and try again.',
  'malformed-provider': 'YouTube’s response could not be read safely. Try again later.',
  'untrusted-enumeration': 'The scan could not be confirmed complete. No removals were authorized.',
  persistence: 'Local storage could not be read or saved. Retry or reopen Likedex.',
  interrupted: 'Background synchronization stopped. Start a new full sync to retry.',
  runtime: 'The extension runtime is unavailable. Retry or reopen Likedex.',
  internal: 'An unexpected extension error occurred. Retry or reopen Likedex.',
};
export function failureMessage(error: RuntimeFailure): string {
  const message = error.detail ? ERROR_MESSAGES[error.detail.category] : {
    'provider-validation-required': 'Synchronization is temporarily unavailable while this build completes provider validation. No sync was started.',
    'storage-error': ERROR_MESSAGES.persistence, 'auth-error': ERROR_MESSAGES.authentication,
    'authorization-pending': 'YouTube access is being checked. Local data is unavailable until verification completes.',
    'data-unavailable': 'Local data is unavailable because its authorization or freshness could not be confirmed.',
    'recovery-error': 'Background recovery failed. Retry or reopen Likedex.',
    'internal-error': ERROR_MESSAGES.internal, 'transport-error': ERROR_MESSAGES.runtime,
    'protocol-error': 'The runtime returned an invalid response. Retry or reopen Likedex.',
    forbidden: 'The runtime rejected this page’s request.', 'invalid-request': 'The runtime could not accept this request.',
  }[error.code];
  return message + (error.cleanup ? ` Local deletion ${error.cleanup.deletion}; authorization-cache cleanup ${error.cleanup.cacheInvalidation}; cleanup status save ${error.cleanup.persistence}.` : '');
}
export const ATTEMPT_LABELS: Record<SyncAttempt['state'], string> = {
  preparing: 'Checking YouTube access', scanning: 'Scanning liked videos', applying: 'Applying updates',
  finalizing: 'Finalizing sync', success: 'Sync complete', partial: 'Sync stopped — mirror partially updated',
  failure: 'Sync failed', interrupted: 'Sync interrupted',
};
export type SyncProgressValue = {
  mode: 'determinate'; rawItems: number; estimatedTotal: number; percentage: number; widthPercent: number;
} | {
  mode: 'indeterminate'; rawItems: number | null; estimatedTotal: null; percentage: null; widthPercent: null;
};

// Counts come from committed membership pages, including distinct items for the
// same video. The provider total is an estimate, never a completion authority.
// Text/ARIA round to the nearest integer; geometry retains the clamped ratio.
export function deriveSyncProgress({ rawItems, estimatedTotal }: Pick<SyncAttempt, 'rawItems' | 'estimatedTotal'>): SyncProgressValue {
  const observed = Number.isSafeInteger(rawItems) && rawItems >= 0 ? rawItems : null;
  if (observed === null || estimatedTotal === null || !Number.isSafeInteger(estimatedTotal) || estimatedTotal <= 0) {
    return { mode: 'indeterminate', rawItems: observed, estimatedTotal: null, percentage: null, widthPercent: null };
  }
  const widthPercent = Math.min(100, Math.max(0, (observed / estimatedTotal) * 100));
  return { mode: 'determinate', rawItems: observed, estimatedTotal, percentage: Math.round(widthPercent), widthPercent };
}
export function formatCount(value: number): string { return value.toLocaleString(); }
export function formatDate(value: string | null): string {
  return value === null ? 'Unknown' : new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
export function formatDuration(value: number | null): string {
  if (value === null) return 'Duration unknown';
  const seconds = Math.floor(value), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
