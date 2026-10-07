import type { AuthenticatedYouTubeBootstrap } from '../domain/authentication';
import { Disclosure } from './Disclosure';
import { StatusIcon } from './StatusIcon';

export function ConnectedAccount({ bootstrap }: { bootstrap: AuthenticatedYouTubeBootstrap }) {
  const name = bootstrap.channelTitle?.trim() || 'YouTube channel';
  const glyph = <StatusIcon kind="connection" tone="success" badge="dot" />;
  return <Disclosure className="connection-disclosure compact-status-control" iconOnly
    title="Connected" ariaLabel={`Connected as ${name} — Read-only`}
    description="Connected to YouTube. Read-only access."
    label={glyph}>
      <h3>Connection information</h3>
      <dl className="status-facts"><div><dt>Connected channel</dt><dd>{bootstrap.channelTitle?.trim() || 'YouTube channel'}</dd></div>
        <div><dt>Access</dt><dd>Read-only</dd></div>
        <div><dt>Channel ID</dt><dd className="channel-id">{bootstrap.channelId}</dd></div></dl>
      <p className="muted">Likedex does not change your likes.</p>
  </Disclosure>;
}
