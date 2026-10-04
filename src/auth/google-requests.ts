import { z } from 'zod';
import type { TokenSource } from './chrome-identity';
import { AuthenticationError, assertNotAborted } from './errors';
import { validateBootstrap } from '../provider/youtube-bootstrap';
import type { AuthenticatedYouTubeBootstrap } from '../domain/authentication';

export const BOOTSTRAP_URL = 'https://www.googleapis.com/youtube/v3/channels?mine=true&part=id%2Csnippet%2CcontentDetails';
export const REVOCATION_URL = 'https://oauth2.googleapis.com/revoke';
export type FetchBoundary = (url: string, init: RequestInit) => Promise<Response>;
export interface RequestTiming {
  now(): number;
  random(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
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

export class GoogleAuthorizationRequests {
  constructor(private readonly tokens: TokenSource, private readonly fetcher: FetchBoundary = fetch,
    private readonly timing: RequestTiming = defaultTiming) {}

  // Includes JSON/body consumption in the 20s fetch deadline. Redirects may
  // never forward a bearer token to another destination.
  private async fetchAndRead<T>(url: string, init: RequestInit, signal: AbortSignal,
    read: (response: Response) => Promise<T>): Promise<T> {
    assertNotAborted(signal);
    const timeout = AbortSignal.timeout(20_000);
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

  private async bootstrapRequest(token: string, signal: AbortSignal): Promise<AuthenticatedYouTubeBootstrap> {
    for (let retry = 0; ; retry++) {
      let retryAfter: string | null = null;
      let transient = false;
      try {
        return await this.fetchAndRead(BOOTSTRAP_URL, { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, signal,
          async (response) => {
            if (!response.ok) {
              const failure = await httpFailure(response);
              transient = failure.code === 'rate-limit'
                || (failure.code === 'unavailable' && [500, 502, 503, 504].includes(response.status));
              retryAfter = response.headers.get('Retry-After');
              throw failure;
            }
            let body: unknown;
            try { body = await response.json(); }
            catch (error) { throw new AuthenticationError(error instanceof SyntaxError ? 'malformed-bootstrap' : 'network'); }
            return validateBootstrap(body);
          });
      } catch (error) {
        if (!(error instanceof AuthenticationError) || retry >= 2 || (!transient && error.code !== 'network')) throw error;
        const delay = this.retryDelay(retryAfter, retry);
        if (delay === null) throw error;
        await this.timing.sleep(delay, signal);
      }
    }
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
  private async bootstrap(interactive: boolean, signal: AbortSignal): Promise<AuthenticatedYouTubeBootstrap> {
    let token = await this.acquire(interactive, signal);
    try { return await this.bootstrapRequest(token, signal); }
    catch (error) {
      if (!(error instanceof AuthenticationError) || error.code !== 'auth-required') throw error;
      await this.tokens.invalidateCachedToken(token);
      token = await this.acquire(false, signal);
      try { return await this.bootstrapRequest(token, signal); }
      catch (replacementError) {
        if (replacementError instanceof AuthenticationError && replacementError.code === 'auth-required') {
          await this.tokens.invalidateCachedToken(token);
        }
        throw replacementError;
      }
    }
  }
  bootstrapSilently(signal: AbortSignal): Promise<AuthenticatedYouTubeBootstrap> { return this.bootstrap(false, signal); }
  connectExplicitly(signal: AbortSignal): Promise<AuthenticatedYouTubeBootstrap> { return this.bootstrap(true, signal); }

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
