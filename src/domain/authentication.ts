import { z } from 'zod';

const identifier = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/);
export const authenticatedBootstrapSchema = z.strictObject({
  channelId: identifier,
  channelTitle: z.string().optional(),
  likesPlaylistId: identifier,
});
export type AuthenticatedYouTubeBootstrap = z.infer<typeof authenticatedBootstrapSchema>;
export type OwnerComparison = 'NO_LOCAL_OWNER' | 'SAME_REMOTE_OWNER' | 'DIFFERENT_REMOTE_OWNER';
export function compareOwner(local: { channelId: string } | null,
  remote: AuthenticatedYouTubeBootstrap): OwnerComparison {
  return local === null ? 'NO_LOCAL_OWNER'
    : local.channelId === remote.channelId ? 'SAME_REMOTE_OWNER' : 'DIFFERENT_REMOTE_OWNER';
}
