import { useCallback, useRef, useState } from 'react';
import { isActiveAttempt } from '../domain/contracts';
import { RuntimeClient } from '../runtime/client';
import type { RuntimeFailure, RuntimeResult } from '../runtime/contracts';
import { LibraryBrowser } from './LibraryBrowser';
import { ATTEMPT_LABELS, failureMessage } from './presentation';
import { useOptionsRuntime } from './use-options-runtime';
import { Icon } from './Icon';
import { BrandMark } from './BrandMark';
import { ConnectedAccount } from './ConnectedAccount';
import { SyncStatus, syncStatusState } from './SyncStatus';

export { SyncStatus } from './SyncStatus';

const AGREEMENT_KEY = 'likedex.privacy-agreement';
const AGREEMENT_VERSION = 'phase7-v1';
function hasAgreement(): boolean {
  try { return localStorage.getItem(AGREEMENT_KEY) === AGREEMENT_VERSION; } catch { return false; }
}
export function PrivacyNotice() {
  return <details id="privacy-notice" className="privacy-notice" open><summary>Likedex privacy notice for this build</summary>
    <p>Likedex uses the YouTube API to read your channel identity, Liked Videos membership, and video metadata. Access is read-only: Likedex does not change your likes or playlists or download video media.</p>
    <p>Your mirror stays in this extension’s storage on this device. Ordinary search, filters, sorting, and details use that local snapshot. Google authorization and API requests, thumbnails, and links you open involve network communication. Likedex has no backend, analytics, or telemetry.</p>
    <p>API data must be refreshed or deleted by its 30-calendar-day deadline. Expired data is blocked and deleted on the next execution opportunity. If required authorization cannot be validated, associated local data is blocked and deletion is attempted.</p>
    <p>Authorization can later be revoked through Google’s account permissions. The planned Disconnect control revokes access and deletes the mirror; planned Clear Local Data deletes the mirror without revoking access. These controls arrive in the later Settings phase and are not available in this build. Revocation and local deletion can fail separately.</p>
    <p>This bundled notice describes this development build. Public policy/support pages and release disclosures remain pending.</p>
    <p><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a> · <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a> · <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Google account permissions</a></p>
  </details>;
}
export function OptionsApp({ client, surface = 'options' }: { client: RuntimeClient; surface?: 'options' | 'sidepanel' }) {
  const { library, auth, stamp, refresh } = useOptionsRuntime(client);
  const refreshExpired = useCallback(() => { void refresh(); }, [refresh]);
  const [agreed, setAgreed] = useState(hasAgreement);
  const [connecting, setConnecting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<RuntimeFailure | null>(null);
  const [localError, setLocalError] = useState('');
  const [acknowledged, setAcknowledged] = useState<RuntimeResult<'SYNC_START'> | null>(null);
  const mutation = useRef(false);
  const privacyDialog = useRef<HTMLDialogElement>(null);
  const recordAgreement = (checked: boolean) => {
    try {
      if (checked) localStorage.setItem(AGREEMENT_KEY, AGREEMENT_VERSION);
      else localStorage.removeItem(AGREEMENT_KEY);
      setAgreed(checked); setLocalError('');
    } catch { setLocalError('Your privacy agreement could not be saved. Check local browser storage and try again.'); }
  };
  const authValue = auth.status === 'ready' ? auth.value : null;
  // Identity DTOs contain Authorized Data: show them only alongside a snapshot
  // that has passed the observer's eligibility/deadline barrier.
  const identity = !agreed ? null : authValue?.status === 'owner-mismatch' ? authValue
    : library.status === 'ready' && authValue?.status === 'authorized'
      && authValue.control.dataGeneration === library.snapshot.dataGeneration
      && authValue.control.authEpoch === library.snapshot.authEpoch ? authValue : null;
  const disconnected = authValue?.status === 'auth-required';
  const mismatch = identity?.status === 'owner-mismatch';
  const active = library.status === 'ready' && library.snapshot.sync?.currentAttempt
    ? isActiveAttempt(library.snapshot.sync.currentAttempt.state) : false;
  const connect = async () => {
    if (mutation.current || !agreed) return;
    try { localStorage.setItem(AGREEMENT_KEY, AGREEMENT_VERSION); }
    catch { setLocalError('Your privacy agreement could not be saved. Check local browser storage and try again.'); return; }
    mutation.current = true; setConnecting(true); setActionError(null); setLocalError('');
    try {
      const result = await client.request('AUTH_CONNECT');
      if (!result.ok) setActionError(result.error);
      await refresh();
    } finally { mutation.current = false; setConnecting(false); }
  };
  const start = async () => {
    if (mutation.current || mismatch) return;
    mutation.current = true; setStarting(true); setActionError(null); setLocalError(''); setAcknowledged(null);
    try {
      const result = await client.request('SYNC_START');
      if (result.ok) setAcknowledged(result.result);
      else setActionError(result.error);
      // Read authoritative truth even when the acknowledgement was lost. Never
      // replay a mutation as a recovery strategy.
      await refresh();
    } finally { mutation.current = false; setStarting(false); }
  };
  const needsConnect = disconnected || (auth.status === 'unavailable' && auth.error.detail?.category === 'authentication');
  const coherent = identity?.status === 'authorized' && library.status === 'ready';
  const sync = library.status === 'ready' ? library.snapshot.sync : null;
  const state = syncStatusState(sync);
  const expandedSync = coherent && (state.active || state.partiallyUpdated || state.attempt?.error || (state.attempt && !state.sameSuccess));
  // A fresh document may receive companion replies in either order. Do not
  // expose ready rows/Sync until the existing identity/context gate also opens.
  const viewLibrary = library.status === 'ready' && (auth.status === 'loading' || authValue?.status === 'validation-pending')
    ? { status: 'loading' as const } : library;
  return <main className={`options-app ${surface === 'sidepanel' ? 'compact-app' : ''}`}>
    <header className="app-header"><div className="brand"><BrandMark /><div><h1>Likedex</h1><p>Your likes, within reach.</p></div></div>
      <div className="header-status">
        <section className="header-account" aria-label="YouTube connection">
          {coherent ? <ConnectedAccount bootstrap={identity.bootstrap} />
            : <span className="status-placeholder" role={auth.status === 'loading' || authValue?.status === 'validation-pending' ? 'status' : undefined}>
              {auth.status === 'loading' ? 'Checking connection…' : authValue?.status === 'validation-pending' ? 'Checking YouTube authorization…'
                : mismatch ? 'Connection needs attention' : needsConnect ? 'Not connected' : auth.status === 'unavailable' ? 'Connection unavailable' : 'Checking connection…'}</span>}
        </section>
        {coherent ? <SyncStatus sync={sync} mode="header" /> : <span className="header-sync-placeholder status-placeholder" aria-hidden="true">Sync status pending</span>}
      </div>
      <div className="header-actions">
        <button onClick={() => { void start(); }} disabled={!agreed || disconnected || !identity || mismatch || active || connecting || starting}>
          <Icon name="sync" className={active || starting ? 'spinning' : ''} />{starting ? 'Requesting sync…' : active ? 'Sync in progress' : 'Sync'}</button>
        <button className="icon-button" aria-label="Privacy & terms" title="Privacy & terms" onClick={() => privacyDialog.current?.showModal()}><Icon name="shield" /></button>
      </div></header>
    {(needsConnect || mismatch || auth.status === 'unavailable' || !agreed || connecting) && <section className="connection" aria-label="Connection guidance">
      {auth.status === 'unavailable' && <div role="alert"><h2>Connection status unavailable</h2><p>{failureMessage(auth.error)}</p></div>}
      {mismatch && identity.status === 'owner-mismatch' && <div role="alert"><h2>Different YouTube channel</h2>
        <p>Local library owner: <span className="channel-id">{identity.localOwnerChannelId}</span></p>
        <p>Connected channel: {identity.bootstrap.channelTitle || 'Name unknown'} · <span className="channel-id">{identity.bootstrap.channelId}</span></p>
        <p>Sync is blocked. Your existing mirror has not been replaced or merged. Select the library’s channel when reconnecting. Confirmed library replacement controls arrive in the later Settings phase.</p></div>}
      {needsConnect && <div className="onboarding"><p className="eyebrow">A local home for your Liked Videos</p><h2>Find that video again.</h2>
        <p>Connect YouTube to mirror your Liked Videos on this device. Access is read-only. After sync, ordinary browsing, search, and filters run locally. You can later revoke authorization.</p>
        <p>Mirrored API data is refreshed or deleted within 30 calendar days. Authorization checks can require a network connection.</p></div>}
      {(!agreed || needsConnect) && <label className="agreement"><input type="checkbox" checked={agreed} onChange={(event) => recordAgreement(event.target.checked)} />
        <span>I have read and agree to the <a href="#privacy-notice" onClick={(event) => { event.preventDefault(); privacyDialog.current?.showModal(); }}>Likedex privacy notice</a> and <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>.</span></label>}
      {(needsConnect || mismatch || (auth.status === 'unavailable')) && <button className="primary" disabled={!agreed || connecting || starting || active} onClick={() => { void connect(); }}>
        {connecting ? 'Connecting YouTube…' : 'Connect YouTube'}</button>}
      {connecting && <p role="status">Waiting for your explicit YouTube authorization…</p>}
      {auth.status === 'unavailable' && <button onClick={() => { void refresh(); }}>Retry connection status</button>}
    </section>}
    {actionError && <div className="action-message" role={actionError.code === 'provider-validation-required' ? 'status' : 'alert'}>{failureMessage(actionError)}</div>}
    {localError && <p role="alert" className="error">{localError}</p>}
    {agreed && library.status === 'ready' ? <>
      {library.snapshot.lastCleanupReason && <p className="notice">{({ clear: 'Local data was cleared without revoking authorization.', disconnect: 'YouTube was disconnected and local data removed.',
        expiry: 'Local data expired and was removed. Your YouTube likes were not changed.',
        'authorization-invalid': 'Authorization was invalid; associated local data was removed.',
        'authorization-unverified': 'Authorization could not be verified; associated local data was removed.' })[library.snapshot.lastCleanupReason]}</p>}
      {coherent && !state.attempt && !state.success && <p className="muted">Connected, never synced. Use Sync to create a local mirror.</p>}
      {expandedSync && <SyncStatus sync={sync} mode="strip" />}</>
      : (library.status !== 'loading' || !agreed) && <section className="sync-status" aria-label="Synchronization status"><p role="alert">
        {!agreed ? 'Read the privacy notice and record your agreement before using connected features.'
          : library.status === 'loading' ? 'Loading sync status…' : 'Sync status unavailable. Local runtime truth could not be retrieved.'}</p>
        {acknowledged && <p>Runtime acknowledged {ATTEMPT_LABELS[acknowledged.attempt.state].toLowerCase()}; awaiting an eligible snapshot.</p>}</section>}
    {acknowledged && library.status === 'loading' && <p className="muted">Runtime acknowledged {ATTEMPT_LABELS[acknowledged.attempt.state].toLowerCase()}; awaiting an eligible snapshot.</p>}
    {library.status === 'unavailable' && <button onClick={() => { void refresh(); }}>Retry local snapshot</button>}
    {agreed && !disconnected && <LibraryBrowser key={stamp} observation={viewLibrary} compact={surface === 'sidepanel'} onExpired={refreshExpired} />}
    <dialog ref={privacyDialog} className="privacy-dialog" aria-labelledby="privacy-title" aria-describedby="privacy-description" onClick={(event) => {
      if (event.target === event.currentTarget) privacyDialog.current?.close();
    }}><div className="dialog-body"><div className="dialog-heading"><h2 id="privacy-title">Privacy &amp; terms</h2>
      <button className="icon-button" aria-label="Close privacy notice" onClick={() => privacyDialog.current?.close()}><Icon name="close" /></button></div>
      <p id="privacy-description" className="muted">Local-first browsing · YouTube access is read-only</p><PrivacyNotice /></div></dialog>
  </main>;
}
