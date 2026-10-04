import { z } from 'zod';
import { AuthenticationError } from '../auth/errors';
import { authenticatedBootstrapSchema, type AuthenticatedYouTubeBootstrap } from '../domain/authentication';

const identifier = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/);
const envelope = z.object({ kind: z.literal('youtube#channelListResponse'), items: z.array(z.unknown()) });
const channel = z.object({
  kind: z.literal('youtube#channel'), id: identifier.optional(),
  snippet: z.object({ title: z.string().optional() }).optional(),
  contentDetails: z.object({ relatedPlaylists: z.object({ likes: identifier.optional() }) }),
});

export function validateBootstrap(value: unknown): AuthenticatedYouTubeBootstrap {
  const response = envelope.safeParse(value);
  if (!response.success) throw new AuthenticationError('malformed-bootstrap');
  if (response.data.items.length !== 1) throw new AuthenticationError('identity-missing');
  const item = channel.safeParse(response.data.items[0]);
  if (!item.success) throw new AuthenticationError('malformed-bootstrap');
  if (item.data.id === undefined) throw new AuthenticationError('identity-missing');
  const likesPlaylistId = item.data.contentDetails.relatedPlaylists.likes;
  if (likesPlaylistId === undefined) throw new AuthenticationError('likes-playlist-missing');
  return authenticatedBootstrapSchema.parse({ channelId: item.data.id, likesPlaylistId,
    ...(item.data.snippet?.title === undefined ? {} : { channelTitle: item.data.snippet.title }) });
}
