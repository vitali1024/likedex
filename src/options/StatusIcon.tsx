import { Disclosure } from './Disclosure';
import { Icon } from './Icon';

// Presentation only: callers map existing runtime truth to these visual treatments.
export function StatusIcon({ kind, tone, badge, spinning = false }: {
  kind: 'connection' | 'sync'; tone: 'success' | 'active' | 'idle' | 'warning' | 'error' | 'disconnected';
  badge?: 'dot' | 'check' | 'warning' | 'error' | undefined; spinning?: boolean;
}) {
  const icon = kind === 'sync' ? 'sync' : tone === 'active' ? 'loader' : tone === 'disconnected' ? 'unplug' : 'link';
  return <span className="status-glyph" data-kind={kind} data-tone={tone} aria-hidden="true">
    <Icon name={icon} className={spinning ? 'spinning' : ''} />
    {badge && <span className="status-badge" data-badge={badge}>
      {badge !== 'dot' && <Icon name={badge === 'check' ? 'check' : badge === 'error' ? 'close' : 'warning'} />}
    </span>}
  </span>;
}

export function HeaderStatusPlaceholder({ kind, label, tone }: {
  kind: 'connection' | 'sync'; label: string; tone: 'active' | 'idle' | 'warning' | 'error' | 'disconnected';
}) {
  return <Disclosure className={`compact-status-control ${kind}-disclosure`} iconOnly ariaLabel={label} title={label}
    label={<StatusIcon kind={kind} tone={tone} spinning={tone === 'active'} badge={tone === 'warning' ? 'warning' : tone === 'error' ? 'error' : undefined} />}>
    <h3>{kind === 'connection' ? 'Connection information' : 'Synchronization details'}</h3>
    <p>{label}</p>
  </Disclosure>;
}
