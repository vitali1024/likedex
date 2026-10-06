import type { CSSProperties } from 'react';
import type { SyncAttempt } from '../domain/contracts';
import { ATTEMPT_LABELS, deriveSyncProgress, formatCount } from './presentation';

export function SyncProgress({ attempt }: { attempt: SyncAttempt }) {
  const progress = deriveSyncProgress(attempt);
  const text = progress.rawItems === null ? 'Scanned count unavailable'
    : progress.mode === 'determinate'
      ? `${formatCount(progress.rawItems)} of ~${formatCount(progress.estimatedTotal)} memberships scanned`
      : `${formatCount(progress.rawItems)} memberships scanned`;
  const determinate = progress.mode === 'determinate';
  const style = determinate ? { '--sync-progress': `${progress.widthPercent}%` } as CSSProperties : undefined;
  return <div className="sync-progress" data-mode={progress.mode}>
    <div className="sync-progress-track" role="progressbar" aria-label={ATTEMPT_LABELS[attempt.state]}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage ?? undefined}
      aria-valuetext={determinate ? `${progress.percentage}% · ${text}` : text} style={style}>
      <span className="sync-progress-fill" aria-hidden="true" />
      {determinate && <span className="sync-progress-badge" aria-hidden="true">{progress.percentage}%</span>}
    </div>
    <p className="sync-progress-count">{text}</p>
  </div>;
}
