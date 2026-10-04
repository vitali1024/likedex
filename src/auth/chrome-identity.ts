import { browser } from 'wxt/browser';
import { AuthenticationError, classifyIdentityFailure } from './errors';

export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
export type ChromeIdentityBoundary = Pick<typeof browser.identity,
  'getAuthToken' | 'removeCachedAuthToken' | 'clearAllCachedAuthTokens'>;

// Internal auth/request boundary only. Tokens must never become service DTOs.
export interface TokenSource {
  getTokenSilently(): Promise<string>;
  connectInteractively(): Promise<string>;
  invalidateCachedToken(token: string): Promise<void>;
  clearCachedAuthorization(): Promise<void>;
}

export class ChromeIdentityAdapter implements TokenSource {
  constructor(private readonly identity: ChromeIdentityBoundary = browser.identity) {}

  private async acquire(interactive: boolean): Promise<string> {
    try {
      const result = await this.identity.getAuthToken({ interactive, scopes: [YOUTUBE_READONLY_SCOPE] });
      if (!result.token) throw new AuthenticationError('auth-required');
      if (result.grantedScopes !== undefined && !result.grantedScopes.includes(YOUTUBE_READONLY_SCOPE)) {
        await this.invalidateCachedToken(result.token);
        throw new AuthenticationError('permission-denied');
      }
      return result.token;
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw classifyIdentityFailure(error, interactive);
    }
  }
  getTokenSilently(): Promise<string> { return this.acquire(false); }
  // Sole interactive boundary: only explicit Connect calls this operation.
  connectInteractively(): Promise<string> { return this.acquire(true); }
  async invalidateCachedToken(token: string): Promise<void> {
    try { await this.identity.removeCachedAuthToken({ token }); }
    catch { throw new AuthenticationError('cache-invalidation-failed'); }
  }
  async clearCachedAuthorization(): Promise<void> {
    try { await this.identity.clearAllCachedAuthTokens(); }
    catch { throw new AuthenticationError('cache-invalidation-failed'); }
  }
}
