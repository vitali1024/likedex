import type { SyncMetadata } from '../domain/contracts';
import { isActiveAttempt } from '../domain/contracts';
import { ATTEMPT_LABELS, ERROR_MESSAGES, formatCount, formatDate } from './presentation';
import { Disclosure } from './Disclosure';
import { Icon } from './Icon';
import { SyncProgress } from './SyncProgress';

export function SyncStatus({ sync }: { sync: SyncMetadata | null }) {
  const attempt = sync?.currentAttempt;
  const success = sync?.latestSuccessfulSync;
  const active = attempt ? isActiveAttempt(attempt.state) : false;
  const healthyActive = active && !attempt?.error;
  const partiallyUpdated = sync !== null && sync.lastMirrorChangeRevision !== sync.lastFinalizedMirrorRevision
    && (Boolean(success) || (attempt?.safeCommits ?? 0) > 0 || (sync.previousCompletedResult?.safeCommits ?? 0) > 0);
  const sameSuccess = success && (!attempt || (attempt.state === 'success' && attempt.attemptId === success.attemptId
    && attempt.ownerChannelId === success.ownerChannelId && attempt.dataGeneration === success.dataGeneration));
  const tone = active ? 'active' : attempt && attempt.state !== 'success' ? 'warning' : success ? 'success' : 'idle';
  return <section className="sync-status" aria-label="Synchronization status" data-tone={tone}>
    <div className="sync-primary">
      <p className="sync-heading"><Icon name={active ? 'sync' : tone === 'success' ? 'check' : 'info'} className={active ? 'spinning' : ''} />
        <span role="status">{sameSuccess ? 'Sync complete' : attempt ? ATTEMPT_LABELS[attempt.state] : 'Never synced'}
          {attempt?.retrying && ' · Retrying a temporary request'}</span>
        {sameSuccess && <><span>{formatCount(success.localMembershipCount)} mirrored memberships</span>
          <span className="muted">Updated <time dateTime={success.completedAt}>{formatDate(success.completedAt)}</time></span></>}
      </p>
      {active && attempt && attempt.state !== 'preparing' && <SyncProgress attempt={attempt} />}
    </div>
    <Disclosure className="sync-disclosure" label="Sync details">
      <h3>Synchronization</h3>
      <p>A full YouTube scan starts only when you choose Sync.</p>
      {attempt && <>
        <p>Phase: {ATTEMPT_LABELS[attempt.state]}</p>
        <p>{formatCount(attempt.pagesAccepted)} pages accepted · {formatCount(attempt.rawItems)} raw items processed · {formatCount(attempt.uniqueMembership)} unique memberships observed</p>
        <p>Provider-estimated total: {attempt.estimatedTotal === null ? 'Unknown' : `~${formatCount(attempt.estimatedTotal)}`}</p>
        <p>Started {formatDate(attempt.startedAt)} · {attempt.finishedAt ? `Finished ${formatDate(attempt.finishedAt)}` : `Checkpoint ${formatDate(attempt.updatedAt)}`}</p>
        <p>{formatCount(attempt.addedCount)} added · {formatCount(attempt.updatedCount)} updated during this attempt</p>
      </>}
      {success && <>
        <p>Latest successful snapshot: {formatCount(success.localMembershipCount)} mirrored memberships · {formatCount(success.localAvailableCount)} available videos</p>
        <p>Completed {formatDate(success.completedAt)}</p>
        <p>{formatCount(success.addedCount)} added · {formatCount(success.updatedCount)} updated · {formatCount(success.removedCount)} removed</p>
      </>}
      {!success && <p>No successful sync recorded.</p>}
    </Disclosure>
    {attempt?.error && <p className="error" role="alert">{ERROR_MESSAGES[attempt.error.category]}</p>}
    {partiallyUpdated && !healthyActive && <p className="notice">The local mirror is partially updated; it has not been fully reconciled since these changes.</p>}
    {success && !sameSuccess && !active && <p className="sync-prior muted">Last successful sync: <time dateTime={success.completedAt}>{formatDate(success.completedAt)}</time> · {formatCount(success.localMembershipCount)} mirrored memberships in that snapshot</p>}
  </section>;
}
