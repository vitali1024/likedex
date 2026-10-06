import type { AuthenticatedYouTubeBootstrap } from '../domain/authentication';
import { Disclosure } from './Disclosure';

export function ConnectedAccount({ bootstrap }: { bootstrap: AuthenticatedYouTubeBootstrap }) {
  return <>
    <p className="account-status"><span className="connection-dot" aria-hidden="true" />YouTube connected · read-only</p>
    <h2>{bootstrap.channelTitle?.trim() || 'YouTube channel'}</h2>
    <Disclosure className="connection-disclosure" label="Connection details">
      <h3>Connected YouTube channel</h3>
      <p>{bootstrap.channelTitle?.trim() || 'Channel name unknown'}</p>
      <p className="channel-id">Channel ID: {bootstrap.channelId}</p>
      <p>Read-only access · Likedex does not change your likes.</p>
    </Disclosure>
  </>;
}
