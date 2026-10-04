import { z } from 'zod';
import type { TokenSource } from './chrome-identity';
import { AuthenticationError, assertNotAborted } from './errors';
import { validateBootstrap } from '../provider/youtube-bootstrap';
import { authenticatedBootstrapSchema, type AuthenticatedYouTubeBootstrap } from '../domain/authentication';
import { videoIdSchema } from '../provider/youtube-schemas';

export const BOOTSTRAP_URL = 'https://www.googleapis.com/youtube/v3/channels?mine=true&part=id%2Csnippet%2CcontentDetails';
export const REVOCATION_URL = 'https://oauth2.googleapis.com/revoke';
export type FetchBoundary = (url: string, init: RequestInit) => Promise<Response>;
export interface RequestTiming {
  now(): number;
  random(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  timeout?(ms: number): AbortSignal;
}
const defaultTiming: RequestTiming = {
  now: () => Date.now(), random: () => Math.random(),
  sleep: (ms, signal) => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new AuthenticationError('cancelled')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  }),
};
const reasonEnvelope = z.object({ error: z.object({ errors: z.array(z.object({ reason: z.string() })).optional() }) });
async function httpFailure(response: Response): Promise<AuthenticationError> {
  if (response.status === 401) return new AuthenticationError('auth-required');
  if (response.status === 429) return new AuthenticationError('rate-limit');
  let reasons: string[] = [];
  try {
    const parsed = reasonEnvelope.safeParse(await response.json());
    if (parsed.success) reasons = parsed.data.error.errors?.map((item) => item.reason) ?? [];
  } catch { /* No raw body or parse exception escapes. */ }
  if (reasons.some((reason) => ['quotaExceeded', 'dailyLimitExceeded'].includes(reason))) return new AuthenticationError('quota');
  if (reasons.some((reason) => ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason))) return new AuthenticationError('rate-limit');
  if (reasons.some((reason) => ['accessNotConfigured', 'keyInvalid'].includes(reason))) return new AuthenticationError('oauth-configuration');
  if (response.status === 403) return new AuthenticationError('permission-denied');
  return new AuthenticationError('unavailable');
}

export interface RevocationOutcome {
  revocation: 'succeeded' | 'failed' | 'unconfirmed';
  cacheInvalidation: 'succeeded' | 'failed';
  error: AuthenticationError | null;
}

interface RequestBudget {
  startedAt: number;
  retries: number;
  recovered: boolean;
}
interface RequestRetries { count: number }
// Internal authenticated provider boundary; never a runtime/UI contract.
export interface YouTubeReadSession {
  playlistItems<T>(pageToken: string | undefined, validate: (value: unknown) => T): Promise<T>;
  videos<T>(videoIds: readonly string[], validate: (value: unknown) => T): Promise<T>;
  assertActive(): void;
  observedAt(): string;
}

export class GoogleAuthorizationRequests {
  constructor(private readonly tokens: TokenSource, private readonly fetcher: FetchBoundary = fetch,
    private readonly timing: RequestTiming = defaultTiming) {}

  // Includes JSON/body consumption in the 20s fetch deadline. Redirects may
  // never forward a bearer token to another destination.
  private async fetchAndRead<T>(url: string, init: RequestInit, signal: AbortSignal,
    read: (response: Response) => Promise<T>): Promise<T> {
    assertNotAborted(signal);
    const timeout = this.timing.timeout?.(20_000) ?? AbortSignal.timeout(20_000);
    try {
      const response = await this.fetcher(url, { ...init, redirect: 'error', credentials: 'omit',
        cache: 'no-store', signal: AbortSignal.any([signal, timeout]) });
      const result = await read(response);
      assertNotAborted(signal);
      if (timeout.aborted) throw new AuthenticationError('network');
      return result;
    } catch (error) {
      assertNotAborted(signal);
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError('network');
    }
  }

  private retryDelay(header: string | null, retry: number): number | null {
    let requested = 0;
    if (header !== null) {
      const seconds = /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - this.timing.now();
      if (Number.isFinite(seconds)) requested = Math.max(0, seconds);
    }
    if (requested > 30_000) return null;
    return Math.max(requested, 1000 * 2 ** retry + Math.floor(this.timing.random() * 251));
  }

  private assertBudget(budget: RequestBudget, signal: AbortSignal): void {
    assertNotAborted(signal);
    const elapsed = this.timing.now() - budget.startedAt;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 600_000) throw new AuthenticationError('request-budget');
  }

  private async jsonRequest(token: string, url: string, signal: AbortSignal,
    malformed: 'malformed-bootstrap' | 'malformed-provider', budget?: RequestBudget,
    retries: RequestRetries = { count: 0 }): Promise<unknown> {
    for (;;) {
      if (budget) this.assertBudget(budget, signal);
      let retryAfter: string | null = null;
      let transient = false;
      try {
        const requestSignal = budget ? AbortSignal.any([signal,
          this.timing.timeout?.(Math.max(1, Math.floor(600_000 - (this.timing.now() - budget.startedAt))))
            ?? AbortSignal.timeout(Math.max(1, Math.floor(600_000 - (this.timing.now() - budget.startedAt))))]) : signal;
        const body = await this.fetchAndRead(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, requestSignal,
          async (response) => {
            if (!response.ok) {
              const failure = await httpFailure(response);
              transient = failure.code === 'rate-limit'
                || (failure.code === 'unavailable' && [500, 502, 503, 504].includes(response.status));
              retryAfter = response.headers.get('Retry-After');
              throw failure;
            }
            try { return await response.json() as unknown; }
            catch (error) { throw new AuthenticationError(error instanceof SyntaxError ? malformed : 'network'); }
          });
        if (budget) this.assertBudget(budget, signal);
        return body;
      } catch (error) {
        if (budget) this.assertBudget(budget, signal);
        if (!(error instanceof AuthenticationError) || retries.count >= 2 || (!transient && error.code !== 'network')) throw error;
        const delay = this.retryDelay(retryAfter, retries.count);
        if (delay === null) throw error;
        if (budget) {
          if (budget.retries >= 6 || this.timing.now() - budget.startedAt + delay >= 600_000) {
            throw new AuthenticationError('request-budget');
          }
          budget.retries++;
        }
        retries.count++;
        await this.timing.sleep(delay, signal);
      }
    }
  }

  private async bootstrapRequest(token: string, signal: AbortSignal, budget?: RequestBudget,
    retries?: RequestRetries): Promise<AuthenticatedYouTubeBootstrap> {
    return validateBootstrap(await this.jsonRequest(token, BOOTSTRAP_URL, signal, 'malformed-bootstrap', budget, retries));
  }

  private async acquire(interactive: boolean, signal: AbortSignal): Promise<string> {
    assertNotAborted(signal);
    const token = await (interactive ? this.tokens.connectInteractively() : this.tokens.getTokenSilently());
    if (signal.aborted) {
      await this.tokens.invalidateCachedToken(token);
      throw new AuthenticationError('cancelled');
    }
    return token;
  }
  private async authenticated<T>(interactive: boolean, signal: AbortSignal,
    request: (token: string) => Promise<T>, recovery: { recovered: boolean },
    revalidate?: (token: string) => Promise<void>): Promise<T> {
    let token = await this.acquire(interactive, signal);
    try { return await request(token); }
    catch (error) {
      if (!(error instanceof AuthenticationError) || error.code !== 'auth-required') throw error;
      await this.tokens.invalidateCachedToken(token);
      if (recovery.recovered) throw error;
      recovery.recovered = true;
      token = await this.acquire(false, signal);
      try {
        await revalidate?.(token);
        return await request(token);
      }
      catch (replacementError) {
        if (replacementError instanceof AuthenticationError && replacementError.code === 'auth-required') {
          await this.tokens.invalidateCachedToken(token);
        }
        throw replacementError;
      }
    }
  }
  private bootstrap(interactive: boolean, signal: AbortSignal): Promise<AuthenticatedYouTubeBootstrap> {
    const retries = { count: 0 };
    return this.authenticated(interactive, signal, (token) => this.bootstrapRequest(token, signal, undefined, retries), { recovered: false });
  }
  bootstrapSilently(signal: AbortSignal): Promise<AuthenticatedYouTubeBootstrap> { return this.bootstrap(false, signal); }
  connectExplicitly(signal: AbortSignal): Promise<AuthenticatedYouTubeBootstrap> { return this.bootstrap(true, signal); }

  createYouTubeReadSession(expected: AuthenticatedYouTubeBootstrap, signal: AbortSignal): YouTubeReadSession {
    const owner = authenticatedBootstrapSchema.parse(expected);
    const budget: RequestBudget = { startedAt: this.timing.now(), retries: 0, recovered: false };
    const read = async <T>(url: string, validate: (body: unknown) => T): Promise<T> => {
      this.assertBudget(budget, signal);
      const retries = { count: 0 };
      const body = await this.authenticated(false, signal,
        (token) => this.jsonRequest(token, url, signal, 'malformed-provider', budget, retries), budget,
        async (token) => {
          const replacement = await this.bootstrapRequest(token, signal, budget);
          if (replacement.channelId !== owner.channelId || replacement.likesPlaylistId !== owner.likesPlaylistId) {
            throw new AuthenticationError('owner-mismatch');
          }
        });
      this.assertBudget(budget, signal);
      return validate(body);
    };
    return {
      playlistItems: (pageToken, validate) => {
        if (pageToken !== undefined && pageToken.length === 0) throw new AuthenticationError('malformed-provider');
        const params = new URLSearchParams({ part: 'id,snippet,contentDetails,status', maxResults: '50', playlistId: owner.likesPlaylistId });
        if (pageToken !== undefined) params.set('pageToken', pageToken);
        return read(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`, validate);
      },
      videos: (ids, validate) => {
        if (ids.length === 0 || ids.length > 50 || new Set(ids).size !== ids.length
          || ids.some((id) => !videoIdSchema.safeParse(id).success)) throw new AuthenticationError('malformed-provider');
        const params = new URLSearchParams({ part: 'snippet,contentDetails,status', id: ids.join(',') });
        return read(`https://www.googleapis.com/youtube/v3/videos?${params}`, validate);
      },
      assertActive: () => this.assertBudget(budget, signal),
      observedAt: () => { this.assertBudget(budget, signal); return new Date(this.timing.now()).toISOString(); },
    };
  }

  async revokeAuthorization(): Promise<RevocationOutcome> {
    let revocation: RevocationOutcome['revocation'] = 'unconfirmed';
    let error: AuthenticationError | null = null;
    try {
      const token = await this.tokens.getTokenSilently();
      revocation = await this.fetchAndRead(REVOCATION_URL, { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString() }, new AbortController().signal,
      async (response) => response.status === 200 ? 'succeeded' : 'failed');
      if (revocation !== 'succeeded') error = new AuthenticationError('revocation-failed');
    } catch { error = new AuthenticationError('revocation-failed'); }
    let cacheInvalidation: RevocationOutcome['cacheInvalidation'] = 'succeeded';
    try { await this.tokens.clearCachedAuthorization(); }
    catch { cacheInvalidation = 'failed'; }
    return { revocation, cacheInvalidation, error };
  }
  clearCachedAuthorization(): Promise<void> { return this.tokens.clearCachedAuthorization(); }
}
