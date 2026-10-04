import { vi } from 'vitest';
import { YOUTUBE_READONLY_SCOPE } from '@/src/auth/chrome-identity';
import type { RequestTiming } from '@/src/auth/google-requests';

// Deliberately synthetic opaque sentinels; never real OAuth credentials.
export const TOKEN_A = 'synthetic-token-a';
export const TOKEN_B = 'synthetic-token-b';
export const bootstrap = { channelId: 'owner-a', channelTitle: 'Same display name', likesPlaylistId: 'likes-owner-a' };
export function channelResponse() {
  return { kind: 'youtube#channelListResponse', items: [{ kind: 'youtube#channel', id: bootstrap.channelId,
    snippet: { title: bootstrap.channelTitle }, contentDetails: { relatedPlaylists: { likes: bootstrap.likesPlaylistId } } }] };
}
export function chromeIdentity() {
  return { getAuthToken: vi.fn().mockResolvedValue({ token: TOKEN_A, grantedScopes: [YOUTUBE_READONLY_SCOPE] }),
    removeCachedAuthToken: vi.fn().mockResolvedValue(undefined), clearAllCachedAuthTokens: vi.fn().mockResolvedValue(undefined) };
}
export function timing(): RequestTiming & { sleep: ReturnType<typeof vi.fn> } {
  return { now: () => Date.parse('2026-10-04T12:00:00.000Z'), random: () => 0, sleep: vi.fn().mockResolvedValue(undefined) };
}
export function json(body: unknown = channelResponse(), status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, ...(headers === undefined ? {} : { headers }) });
}
export function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
