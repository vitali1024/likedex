import type { AuthenticatedYouTubeBootstrap } from '../domain/authentication';
import { Disclosure } from './Disclosure';

export function ConnectedAccount({ bootstrap }: { bootstrap: AuthenticatedYouTubeBootstrap }) {
  const name = bootstrap.channelTitle?.trim() || 'YouTube channel';
  return <Disclosure className="connection-disclosure" ariaLabel={`Connection details for ${name}`}
    description="Connected to YouTube. Read-only access."
    label={<span className="account-primary"><span className="connection-dot" aria-hidden="true" />
      <span className="account-name">{name}</span><span className="status-chip">Read-only</span></span>}>
      <h3>Connection information</h3>
      <dl className="status-facts"><div><dt>Connected channel</dt><dd>{bootstrap.channelTitle?.trim() || 'YouTube channel'}</dd></div>
        <div><dt>Access</dt><dd>Read-only</dd></div>
        <div><dt>Channel ID</dt><dd className="channel-id">{bootstrap.channelId}</dd></div></dl>
      <p className="muted">Likedex does not change your likes.</p>
  </Disclosure>;
}
