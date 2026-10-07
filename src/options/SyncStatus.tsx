import type { ReactNode } from 'react';
import type { SyncAttempt, SyncMetadata, LatestSuccessfulSync as SuccessfulSync } from '../domain/contracts';
import { isActiveAttempt } from '../domain/contracts';
import { ATTEMPT_LABELS, ERROR_MESSAGES, formatCount, formatDate } from './presentation';
import { Disclosure } from './Disclosure';
import { Icon } from './Icon';
import { SyncProgress } from './SyncProgress';
import { StatusIcon } from './StatusIcon';

function Facts({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return <section className="sync-detail-group"><h4>{title}</h4><dl className="status-facts">
    {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl></section>;
}
function DateValue({ value }: { value: string }) {
  return <time dateTime={value}>{formatDate(value)}</time>;
}
function SnapshotFacts({ success }: { success: SuccessfulSync }) {
  return <Facts title="Library snapshot" rows={[
    ['Mirrored videos', formatCount(success.localMembershipCount)],
    ['Available videos', formatCount(success.localAvailableCount)],
  ]} />;
}
function Changes({ result }: { result: SyncAttempt | SuccessfulSync }) {
  const rows: [string, ReactNode][] = [['Added', formatCount(result.addedCount)], ['Refreshed', formatCount(result.updatedCount)]];
  // Removal is a finalized result, never an unfinished attempt's implied zero.
  if ('removedCount' in result) rows.push(['Removed', formatCount(result.removedCount)]);
  return <Facts title="Changes" rows={rows} />;
}
function AttemptFacts({ attempt, success }: { attempt: SyncAttempt; success: SuccessfulSync | undefined }) {
  return <div className="sync-detail-grid">
    <Facts title="Status" rows={[
      ['Phase', ATTEMPT_LABELS[attempt.state]],
      ...(attempt.retrying ? [['Request', 'Retrying a temporary request'] as [string, ReactNode]] : []),
    ]} />
    <Facts title="Scan" rows={[
      [success ? 'Pages scanned' : 'Pages processed', formatCount(attempt.pagesAccepted)],
      ['Memberships scanned', formatCount(attempt.rawItems)],
      ['Unique videos observed', formatCount(attempt.uniqueMembership)],
      ['Provider estimate', attempt.estimatedTotal === null ? 'Unknown' : `~${formatCount(attempt.estimatedTotal)}`],
    ]} />
    {success && <SnapshotFacts success={success} />}
    <Changes result={success ?? attempt} />
    <Facts title="Timing" rows={[
      ['Started', <DateValue key="started" value={attempt.startedAt} />],
      [success ? 'Completed' : attempt.finishedAt ? 'Finished' : 'Checkpoint',
        <DateValue key="finished" value={success?.completedAt ?? attempt.finishedAt ?? attempt.updatedAt} />],
    ]} />
  </div>;
}
function SuccessfulFacts({ success }: { success: SuccessfulSync }) {
  return <div className="sync-detail-grid"><SnapshotFacts success={success} /><Changes result={success} />
    <Facts title="Timing" rows={[
      ['Started', <DateValue key="started" value={success.startedAt} />], ['Completed', <DateValue key="completed" value={success.completedAt} />],
    ]} /></div>;
}

export function syncStatusState(sync: SyncMetadata | null) {
  const attempt = sync?.currentAttempt;
  const success = sync?.latestSuccessfulSync;
  const active = attempt ? isActiveAttempt(attempt.state) : false;
  const healthyActive = active && !attempt?.error;
  const partiallyUpdated = sync !== null && sync.lastMirrorChangeRevision !== sync.lastFinalizedMirrorRevision
    && (Boolean(success) || (attempt?.safeCommits ?? 0) > 0 || (sync.previousCompletedResult?.safeCommits ?? 0) > 0);
  const sameSuccess = success && (!attempt || (attempt.state === 'success' && attempt.attemptId === success.attemptId
    && attempt.ownerChannelId === success.ownerChannelId && attempt.dataGeneration === success.dataGeneration));
  const tone: 'active' | 'warning' | 'success' | 'idle' = active ? 'active' : attempt && attempt.state !== 'success' ? 'warning' : success ? 'success' : 'idle';
  return { attempt, success, active, healthyActive, partiallyUpdated, sameSuccess, tone };
}

export function SyncStatus({ sync, mode = 'expanded' }: { sync: SyncMetadata | null; mode?: 'header' | 'strip' | 'expanded' }) {
  const { attempt, success, active, healthyActive, partiallyUpdated, sameSuccess, tone } = syncStatusState(sync);
  const header = mode === 'header';
  const phaseLabel = `${sameSuccess ? 'Sync complete' : attempt ? ATTEMPT_LABELS[attempt.state] : 'Never synced'}${attempt?.retrying ? ' · Retrying a temporary request' : ''}`;
  const updatedLabel = sameSuccess && success ? `Updated ${formatDate(success.completedAt)}` : '';
  const glyph = <StatusIcon kind="sync" tone={attempt?.error ? 'error' : tone} spinning={active}
    badge={active ? undefined : attempt?.error ? 'error' : sameSuccess ? 'check' : tone === 'warning' ? 'warning' : undefined} />;
  const Phase = header ? 'span' : 'p';
  const heading = <Phase className={header ? 'sync-heading sr-only' : 'sync-heading'} role={mode === 'strip' ? undefined : 'status'}>{phaseLabel}</Phase>;
  const details = <Disclosure className={`sync-disclosure ${header ? 'compact-status-control' : ''}`} iconOnly={header}
    title={header ? active ? 'Sync in progress' : phaseLabel : undefined}
    ariaLabel={header ? `${active ? 'Sync in progress — ' : ''}${phaseLabel}${updatedLabel ? ` — ${updatedLabel}` : ''}` : 'Sync details'}
    label={header ? <>{glyph}{heading}</> : 'Sync details'}>
      <h3>Synchronization details</h3>
      {header && <><p className="sync-details-summary">{phaseLabel}</p>
        {sameSuccess && success && <p className="muted">Updated <DateValue value={success.completedAt} /></p>}</>}
      <p className="muted sync-details-intro">Full scans run only when you choose Sync.</p>
      {attempt && <section className="sync-detail-event">
        {!sameSuccess && <h3>{active ? 'Current sync' : 'Current attempt'}</h3>}
        <AttemptFacts attempt={attempt} success={sameSuccess && success ? success : undefined} />
      </section>}
      {success && !(sameSuccess && attempt) && <section className="sync-detail-event">
        {!sameSuccess && <h3>{active ? 'Previous successful snapshot' : 'Last successful snapshot'}</h3>}
        {!attempt && <Facts title="Scan" rows={[
          ['Pages scanned', formatCount(success.pageCount)], ['Memberships scanned', formatCount(success.rawRemoteCount)],
          ['Unique videos observed', formatCount(success.uniqueRemoteCount)],
        ]} />}
        <SuccessfulFacts success={success} />
      </section>}
      {!success && <p>No successful sync recorded.</p>}
    </Disclosure>;
  if (mode === 'header') return <section className="header-sync" aria-label="Synchronization status" data-tone={tone}>{details}</section>;
  return <section className="sync-status" aria-label={mode === 'strip' ? 'Sync progress and recovery' : 'Synchronization status'} data-tone={tone}>
    <div className="sync-primary">
      <span className="status-icon"><Icon name={active ? 'sync' : tone === 'success' ? 'check' : 'info'} className={active ? 'spinning' : ''} /></span>
      <div className="sync-primary-content">{heading}
        {sameSuccess && success && <div className="sync-metadata"><p className="sync-metric">{formatCount(success.localMembershipCount)} mirrored</p>
          <p className="sync-updated muted">Updated <DateValue value={success.completedAt} /></p></div>}
      {active && attempt && attempt.state !== 'preparing' && <SyncProgress attempt={attempt} />}
      </div>
    </div>
    {mode !== 'strip' && details}
    {attempt?.error && <p className="error" role="alert">{ERROR_MESSAGES[attempt.error.category]}</p>}
    {partiallyUpdated && !healthyActive && <p className="notice">The local mirror is partially updated; it has not been fully reconciled since these changes.</p>}
    {success && !sameSuccess && !active && <p className="sync-prior muted">Last successful sync: <time dateTime={success.completedAt}>{formatDate(success.completedAt)}</time> · {formatCount(success.localMembershipCount)} mirrored memberships in that snapshot</p>}
  </section>;
}
