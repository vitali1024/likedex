import { describe, expect, it, vi } from 'vitest';
import { ChromeIdentityAdapter, YOUTUBE_READONLY_SCOPE } from '@/src/auth/chrome-identity';
import { AuthenticationError } from '@/src/auth/errors';
import { BOOTSTRAP_URL, GoogleAuthorizationRequests, REVOCATION_URL } from '@/src/auth/google-requests';
import { validateBootstrap } from '@/src/provider/youtube-bootstrap';
import { compareOwner } from '@/src/domain/authentication';
import { TOKEN_A, TOKEN_B, bootstrap, channelResponse, chromeIdentity, held, json, timing } from '../fixtures/authentication';

function setup() {
  const chrome = chromeIdentity();
  const identity = new ChromeIdentityAdapter(chrome);
  const fetcher = vi.fn().mockResolvedValue(json());
  const clock = timing();
  const requests = new GoogleAuthorizationRequests(identity, fetcher, clock);
  const signal = new AbortController().signal;
  return { chrome, identity, fetcher, clock, requests, signal };
}

describe('Chrome Identity boundary (AC-AUTH-002–005 service portions)', () => {
  it('does nothing at construction, acquires silently, and only explicit connect is interactive', async () => {
    const { chrome, identity } = setup();
    expect(chrome.getAuthToken).not.toHaveBeenCalled();
    await expect(identity.getTokenSilently()).resolves.toBe(TOKEN_A);
    await identity.connectInteractively();
    expect(chrome.getAuthToken.mock.calls).toEqual([
      [{ interactive: false, scopes: [YOUTUBE_READONLY_SCOPE] }],
      [{ interactive: true, scopes: [YOUTUBE_READONLY_SCOPE] }],
    ]);
  });
  it('returns typed auth-required for missing token, without interactive fallback', async () => {
    const { chrome, requests, signal, fetcher } = setup();
    chrome.getAuthToken.mockResolvedValue({});
    await expect(requests.bootstrapSilently(signal)).rejects.toMatchObject({ code: 'auth-required' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(chrome.getAuthToken).toHaveBeenCalledExactlyOnceWith({ interactive: false, scopes: [YOUTUBE_READONLY_SCOPE] });
  });
  it.each([
    ['The user is not signed in.', 'auth-required'], ['OAuth2 not granted or revoked.', 'auth-required'],
    ['The user did not approve access.', 'permission-denied'], ['invalid_client private details', 'oauth-configuration'],
    ['Network connection failed', 'network'], ['unknown private details', 'unexpected'],
  ])('sanitizes Chrome rejection %s', async (message, code) => {
    const { chrome, identity } = setup();
    chrome.getAuthToken.mockRejectedValue(new Error(message));
    await expect(identity.connectInteractively()).rejects.toMatchObject({ code, message: `Likedex authentication: ${code}` });
  });
  it('rejects omitted read scope and removes its token; no fabricated authorization', async () => {
    const { chrome, identity } = setup();
    chrome.getAuthToken.mockResolvedValue({ token: TOKEN_A, grantedScopes: [] });
    await expect(identity.connectInteractively()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(chrome.removeCachedAuthToken).toHaveBeenCalledExactlyOnceWith({ token: TOKEN_A });
  });
  it('uses Promise cache APIs and sanitizes cache failures', async () => {
    const { chrome, identity } = setup();
    await identity.invalidateCachedToken(TOKEN_A);
    expect(chrome.removeCachedAuthToken).toHaveBeenCalledExactlyOnceWith({ token: TOKEN_A });
    chrome.clearAllCachedAuthTokens.mockRejectedValue(new Error(TOKEN_A));
    await expect(identity.clearCachedAuthorization()).rejects.toMatchObject({ code: 'cache-invalidation-failed' });
  });
});

describe('Authenticated bootstrap requests (AC-AUTH-004, AC-IDENTITY-001/002)', () => {
  it('uses exact channels.list GET; returns only validated identity, never the token', async () => {
    const { requests, fetcher, signal } = setup();
    const result = await requests.bootstrapSilently(signal);
    expect(result).toEqual(bootstrap);
    expect(JSON.stringify(result)).not.toContain(TOKEN_A);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(BOOTSTRAP_URL, expect.objectContaining({ method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN_A}` }, redirect: 'error', credentials: 'omit', cache: 'no-store' }));
    const url = new URL(BOOTSTRAP_URL);
    expect(url.pathname).toBe('/youtube/v3/channels');
    expect([...url.searchParams]).toEqual([['mine', 'true'], ['part', 'id,snippet,contentDetails']]);
  });
  it('evicts exact 401 token, silently reacquires once and revalidates bootstrap on retry', async () => {
    const { chrome, requests, fetcher, signal } = setup();
    chrome.getAuthToken.mockResolvedValueOnce({ token: TOKEN_A }).mockResolvedValueOnce({ token: TOKEN_B });
    fetcher.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json());
    await expect(requests.connectExplicitly(signal)).resolves.toEqual(bootstrap);
    expect(chrome.removeCachedAuthToken).toHaveBeenCalledExactlyOnceWith({ token: TOKEN_A });
    expect(chrome.getAuthToken.mock.calls.map(([details]) => details.interactive)).toEqual([true, false]);
    expect(fetcher.mock.calls[1]?.[1].headers.Authorization).toBe(`Bearer ${TOKEN_B}`);
  });
  it('stops after the second 401 and evicts the invalid replacement without acquiring again', async () => {
    const { chrome, requests, fetcher, signal } = setup();
    fetcher.mockResolvedValue(json({}, 401));
    await expect(requests.bootstrapSilently(signal)).rejects.toMatchObject({ code: 'auth-required' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(chrome.getAuthToken).toHaveBeenCalledTimes(2);
    expect(chrome.removeCachedAuthToken).toHaveBeenCalledTimes(2);
  });
  it('stops if replacement authorization is unavailable or eviction fails', async () => {
    const { chrome, requests, fetcher, signal } = setup();
    fetcher.mockResolvedValue(json({}, 401));
    chrome.getAuthToken.mockResolvedValueOnce({ token: TOKEN_A }).mockResolvedValueOnce({});
    await expect(requests.bootstrapSilently(signal)).rejects.toMatchObject({ code: 'auth-required' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    chrome.removeCachedAuthToken.mockRejectedValue(new Error(TOKEN_A));
    chrome.getAuthToken.mockResolvedValue({ token: TOKEN_A });
    await expect(requests.bootstrapSilently(signal)).rejects.toMatchObject({ code: 'cache-invalidation-failed' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    [403, {}, 'permission-denied', 1],
    [403, { error: { errors: [{ reason: 'quotaExceeded' }] } }, 'quota', 1],
    [403, { error: { errors: [{ reason: 'accessNotConfigured' }] } }, 'oauth-configuration', 1],
    [403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }, 'rate-limit', 3],
    [503, { error: { errors: [{ reason: 'quotaExceeded' }] } }, 'quota', 1],
    [429, {}, 'rate-limit', 3], [503, {}, 'unavailable', 3], [404, {}, 'unavailable', 1],
  ])('preserves HTTP %i category with bounded transient recovery, without token cycling', async (status, body, code, calls) => {
    const { chrome, requests, fetcher, signal } = setup();
    fetcher.mockImplementation(() => Promise.resolve(json(body, status)));
    await expect(requests.bootstrapSilently(signal)).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(chrome.getAuthToken).toHaveBeenCalledTimes(1);
    expect(chrome.removeCachedAuthToken).not.toHaveBeenCalled();
  });
  it('preserves exhausted network failures, uses 1s/2s delays, and succeeds after a transient failure', async () => {
    const { requests, fetcher, clock, signal } = setup();
    fetcher.mockRejectedValue(new Error(TOKEN_A));
    await expect(requests.bootstrapSilently(signal)).rejects.toMatchObject({ code: 'network', message: 'Likedex authentication: network' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(clock.sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    fetcher.mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(json());
    await expect(requests.bootstrapSilently(signal)).resolves.toEqual(bootstrap);
  });
  it.each(['31', 'Sun, 04 Oct 2026 12:00:31 GMT'])('stops rather than waiting beyond 30s Retry-After: %s', async (header) => {
    const { requests, fetcher, clock, signal } = setup();
    fetcher.mockImplementation(() => Promise.resolve(json({}, 429, { 'Retry-After': header })));
    await expect(requests.bootstrapSilently(signal)).rejects.toMatchObject({ code: 'rate-limit' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(clock.sleep).not.toHaveBeenCalled();
  });
  it('honors legal Retry-After and cancels before reacquisition/backoff', async () => {
    const { requests, fetcher, clock } = setup();
    fetcher.mockResolvedValueOnce(json({}, 429, { 'Retry-After': '4' })).mockResolvedValueOnce(json());
    await requests.bootstrapSilently(new AbortController().signal);
    expect(clock.sleep).toHaveBeenCalledWith(4000, expect.any(AbortSignal));
    const abort = new AbortController(); abort.abort();
    await expect(requests.bootstrapSilently(abort.signal)).rejects.toMatchObject({ code: 'cancelled' });
  });
  it('invalidates a token acquired after Connect cancellation', async () => {
    const { chrome, requests, fetcher } = setup();
    const token = held<{ token: string }>();
    chrome.getAuthToken.mockReturnValue(token.promise);
    const abort = new AbortController();
    const result = requests.connectExplicitly(abort.signal);
    abort.abort(); token.resolve({ token: TOKEN_A });
    await expect(result).rejects.toMatchObject({ code: 'cancelled' });
    expect(chrome.removeCachedAuthToken).toHaveBeenCalledExactlyOnceWith({ token: TOKEN_A });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects malformed HTTP-200 JSON without retrying', async () => {
    const { requests, fetcher, signal } = setup();
    fetcher.mockResolvedValue(new Response('{broken'));
    await expect(requests.bootstrapSilently(signal)).rejects.toMatchObject({ code: 'malformed-bootstrap' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps response-body transport failure as network rather than schema failure', async () => {
    const { requests, fetcher, signal } = setup();
    fetcher.mockImplementation(() => {
      const response = json();
      vi.spyOn(response, 'json').mockRejectedValue(new TypeError('body transport interrupted'));
      return Promise.resolve(response);
    });
    await expect(requests.bootstrapSilently(signal)).rejects.toMatchObject({ code: 'network' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe('Bootstrap validation and owner identity (AC-IDENTITY-001/002)', () => {
  it.each([
    null, [], {}, { items: [] }, { kind: 'wrong', items: [] },
    { kind: 'youtube#channelListResponse' }, { kind: 'youtube#channelListResponse', items: {} },
  ])('rejects invalid envelope %#', (body) => {
    expect(() => validateBootstrap(body)).toThrow(expect.objectContaining({ code: 'malformed-bootstrap' }));
  });
  it.each([{ items: [] }, { items: [channelResponse().items[0], channelResponse().items[0]] }])('refuses zero/multiple channels', ({ items }) => {
    expect(() => validateBootstrap({ ...channelResponse(), items })).toThrow(expect.objectContaining({ code: 'identity-missing' }));
  });
  it.each([
    [{ id: undefined }, 'identity-missing'], [{ id: '' }, 'malformed-bootstrap'],
    [{ id: 42 }, 'malformed-bootstrap'], [{ id: ' bad id ' }, 'malformed-bootstrap'],
    [{ contentDetails: undefined }, 'malformed-bootstrap'], [{ contentDetails: {} }, 'malformed-bootstrap'],
    [{ contentDetails: { relatedPlaylists: {} } }, 'likes-playlist-missing'],
    [{ contentDetails: { relatedPlaylists: { likes: 42 } } }, 'malformed-bootstrap'],
    [{ contentDetails: { relatedPlaylists: { likes: '' } } }, 'malformed-bootstrap'],
    [{ snippet: { title: 42 } }, 'malformed-bootstrap'],
  ])('rejects missing/malformed identity field %#', (patch, code) => {
    const body = channelResponse();
    body.items = [{ ...body.items[0], ...patch }] as typeof body.items;
    expect(() => validateBootstrap(body)).toThrow(expect.objectContaining({ code }));
  });
  it('omits unavailable title honestly; preserves empty title and ignores unneeded fields', () => {
    const item = channelResponse().items[0];
    expect(validateBootstrap({ ...channelResponse(), items: [{ ...item, snippet: undefined }] }))
      .toEqual({ channelId: bootstrap.channelId, likesPlaylistId: bootstrap.likesPlaylistId });
    expect(validateBootstrap({ ...channelResponse(), items: [{ ...item, snippet: { title: '', ignored: 'extra' } }] }).channelTitle).toBe('');
  });
  it('compares stable channel IDs, never identical display names or playlist identifiers', () => {
    expect(compareOwner(null, bootstrap)).toBe('NO_LOCAL_OWNER');
    expect(compareOwner({ channelId: 'owner-a' }, bootstrap)).toBe('SAME_REMOTE_OWNER');
    expect(compareOwner({ channelId: 'owner-b' }, bootstrap)).toBe('DIFFERENT_REMOTE_OWNER');
  });
});

describe('Supported Google revocation (AC-AUTH-007 service subset)', () => {
  it('POSTs an ephemeral form token at the fixed endpoint and clears Chrome cache independently', async () => {
    const { requests, fetcher, chrome } = setup();
    fetcher.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(requests.revokeAuthorization()).resolves.toEqual({ revocation: 'succeeded', cacheInvalidation: 'succeeded', error: null });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(REVOCATION_URL, expect.objectContaining({ method: 'POST',
      body: `token=${TOKEN_A}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, redirect: 'error' }));
    expect(chrome.clearAllCachedAuthTokens).toHaveBeenCalledTimes(1);
  });
  it('reports HTTP revoke failure independently of successful cache clearing', async () => {
    const { requests, fetcher } = setup();
    fetcher.mockResolvedValue(json({}, 400));
    await expect(requests.revokeAuthorization()).resolves.toMatchObject({ revocation: 'failed', cacheInvalidation: 'succeeded',
      error: { code: 'revocation-failed' } });
  });
  it.each(['missing', 'network'])('reports unconfirmed remote revoke for %s without consent', async (failure) => {
    const { requests, fetcher, chrome } = setup();
    if (failure === 'missing') chrome.getAuthToken.mockResolvedValue({});
    else fetcher.mockRejectedValue(new Error(TOKEN_A));
    const result = await requests.revokeAuthorization();
    expect(result.revocation).toBe('unconfirmed');
    expect(result.cacheInvalidation).toBe('succeeded');
    expect(JSON.stringify(result)).not.toContain(TOKEN_A);
    expect(chrome.getAuthToken.mock.calls.every(([details]) => details.interactive === false)).toBe(true);
  });
  it('does not reinterpret cache failure as remote revocation failure', async () => {
    const { requests, fetcher, chrome } = setup();
    fetcher.mockResolvedValue(new Response(null, { status: 200 }));
    chrome.clearAllCachedAuthTokens.mockRejectedValue(new AuthenticationError('cache-invalidation-failed'));
    await expect(requests.revokeAuthorization()).resolves.toMatchObject({ revocation: 'succeeded', cacheInvalidation: 'failed' });
  });
});
