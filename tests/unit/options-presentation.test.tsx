import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LibraryBrowser, VideoDetail } from '@/src/options/LibraryBrowser';
import { PrivacyNotice, SyncStatus } from '@/src/options/OptionsApp';
import { ATTEMPT_LABELS, failureMessage } from '@/src/options/presentation';
import { ConnectedAccount } from '@/src/options/ConnectedAccount';
import { SyncProgress } from '@/src/options/SyncProgress';
import { failure } from '@/src/runtime/contracts';
import { optionsSnapshot, optionsVideos } from '../fixtures/options';
import { attempt, NEXT_ATTEMPT_ID, OBSERVED, success } from '../fixtures/storage';

describe('Options presentation (AC-OPTIONS-001, AC-SYNC-005/007/011/013)', () => {
  it('renders privacy/read-only/retention/controls explanations and real service links', () => {
    const html = renderToStaticMarkup(<PrivacyNotice />);
    expect(html).toContain('read-only'); expect(html).toContain('30-calendar-day');
    expect(html).toContain('https://www.youtube.com/t/terms'); expect(html).toContain('https://policies.google.com/privacy');
  });
  it.each(Object.keys(ATTEMPT_LABELS) as (keyof typeof ATTEMPT_LABELS)[])('renders authoritative %s and previous success independently', (state) => {
    const html = renderToStaticMarkup(<SyncStatus sync={{ ...optionsSnapshot().sync!, currentAttempt: attempt({ state,
      finishedAt: ['preparing', 'scanning', 'applying', 'finalizing'].includes(state) ? null : OBSERVED }), latestSuccessfulSync: success() }} />);
    expect(html).toContain(ATTEMPT_LABELS[state]);
    if (['partial', 'failure', 'interrupted'].includes(state)) expect(html).toContain('Last successful sync:');
    else expect(html).not.toContain('Last successful sync:');
  });
  it('renders snapshot failures without a synthetic 0-video count', () => {
    const html = renderToStaticMarkup(<LibraryBrowser observation={{ status: 'unavailable', error: failure('storage-error') }} />);
    expect(html).toContain('Library unavailable'); expect(html).toContain('No valid library count'); expect(html).not.toContain('0 available videos');
  });
  it('distinguishes loading, completed empty, no available and no matches', () => {
    expect(renderToStaticMarkup(<LibraryBrowser observation={{ status: 'loading' }} />)).toContain('Loading local snapshot');
    expect(renderToStaticMarkup(<LibraryBrowser observation={{ status: 'ready', snapshot: optionsSnapshot(0) }} />)).toContain('Your local mirror is empty');
    const snapshot = optionsSnapshot(1); snapshot.videos[0]!.availability = { state: 'unknown', evidence: 'not-fetched' };
    expect(renderToStaticMarkup(<LibraryBrowser observation={{ status: 'ready', snapshot }} />)).toContain('No available videos');
  });
  it('renders real library, bounded list and intentional unknown detail metadata', () => {
    const html = renderToStaticMarkup(<LibraryBrowser observation={{ status: 'ready', snapshot: optionsSnapshot() }} />);
    expect(html.match(/class="video-row"/g)).toHaveLength(50); expect(html).toContain('62 available videos');
    const detail = renderToStaticMarkup(<VideoDetail video={optionsVideos()[1]!} onBack={() => {}} />);
    expect(detail).toContain('Date liked unknown'); expect(detail).toContain('https://www.youtube.com/watch?v=v0000000001');
  });
  it('shows a closed-gate rejection without inventing activity', () => {
    expect(failureMessage(failure('provider-validation-required'))).toContain('No sync was started');
  });
});

describe('Handoff B status hierarchy and connected account', () => {
  const render = (overrides: Parameters<typeof attempt>[0]) => renderToStaticMarkup(<SyncStatus sync={{
    ...optionsSnapshot().sync!, currentAttempt: attempt(overrides), lastMirrorChangeRevision: 2,
  }} />);
  it('renders durable raw progress with an approximate denominator and accessible value', () => {
    const html = render({ rawItems: 1750, uniqueMembership: 1700, estimatedTotal: 3547 });
    expect(html).toContain('1,750 of ~3,547 memberships scanned'); expect(html).toContain('49%');
    expect(html).toContain('role="progressbar"'); expect(html).toContain('aria-valuenow="49"');
    expect(html).toContain('aria-valuemin="0"'); expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-label="Scanning liked videos"');
    expect(html).not.toContain('class="notice"');
  });
  it('uses observed counts without fake percent/denominator when total is unknown', () => {
    const html = render({ rawItems: 1750, estimatedTotal: null });
    expect(html).toContain('1,750 memberships scanned'); expect(html).toContain('role="progressbar"');
    expect(html).not.toContain('aria-valuenow'); expect(html).not.toContain('%'); expect(html).not.toContain('of ~');
  });
  it('preparing remains a phase without an unsupported zero percent', () => {
    const html = render({ state: 'preparing' });
    expect(html).toContain('Checking YouTube access'); expect(html).not.toContain('role="progressbar"');
  });
  it.each(['applying', 'finalizing'] as const)('preserves the checkpoint in %s without declaring completion', (state) => {
    const html = render({ state, rawItems: 100, estimatedTotal: 200 });
    expect(html).toContain('aria-valuenow="50"'); expect(html).not.toContain('Sync complete');
  });
  it('keeps finalizing indeterminate without a denominator, including zero total', () => {
    for (const estimatedTotal of [null, 0]) {
      const html = render({ state: 'finalizing', estimatedTotal });
      expect(html).toContain('role="progressbar"'); expect(html).not.toContain('aria-valuenow');
      expect(html).not.toContain('Sync complete');
    }
  });
  it('100% scanned while finalizing still requires durable success to claim Sync complete', () => {
    const html = render({ state: 'finalizing', rawItems: 200, estimatedTotal: 200 });
    expect(html).toContain('aria-valuenow="100"'); expect(html).not.toContain('Sync complete');
  });
  it('settles matching durable success into one compact primary summary', () => {
    const html = renderToStaticMarkup(<SyncStatus sync={{ ...optionsSnapshot().sync!,
      currentAttempt: attempt({ state: 'success', finishedAt: OBSERVED }) }} />);
    const primary = html.split('<details')[0]!;
    expect(primary).toContain('Sync complete'); expect(primary).toContain('2 mirrored memberships');
    expect(primary).toContain('Updated'); expect(primary.match(/<time /g)).toHaveLength(1);
    expect(primary).not.toContain('pages accepted'); expect(html).not.toContain('Last successful sync:');
    expect(html).not.toContain('role="progressbar"');
  });
  it('does not collapse a different successful attempt into the latest-success summary', () => {
    expect(render({ state: 'success', attemptId: NEXT_ATTEMPT_ID, finishedAt: OBSERVED })).toContain('Last successful sync:');
  });
  it.each(['partial', 'failure', 'interrupted'] as const)('retains partial provenance and previous successful snapshot after %s', (state) => {
    const html = render({ state, safeCommits: 1, finishedAt: OBSERVED,
      error: { category: 'network', messageKey: 'network-failed', phase: 'scanning' } });
    expect(html).toContain('class="notice"'); expect(html).toContain('role="alert"');
    expect(html).toContain('Last successful sync:'); expect(html).toContain('2 mirrored memberships in that snapshot');
    expect(html).not.toContain('Never synced'); expect(html).not.toContain('role="progressbar"');
  });
  it('retains unreconciled changes from a prior interrupted attempt without current work', () => {
    const html = renderToStaticMarkup(<SyncStatus sync={{ ...optionsSnapshot().sync!, latestSuccessfulSync: null,
      previousCompletedResult: attempt({ state: 'interrupted', safeCommits: 1, finishedAt: OBSERVED }),
      lastMirrorChangeRevision: 2 }} />);
    expect(html).toContain('class="notice"');
  });
  it('integrates retry truth into the phase without advancing the checkpoint', () => {
    const html = render({ retrying: true, rawItems: 100, estimatedTotal: 200 });
    expect(html).toContain('Scanning liked videos · Retrying a temporary request');
    expect(html).toContain('aria-valuenow="50"');
  });
  it('conservatively displays unavailable count for malformed progress', () => {
    const html = renderToStaticMarkup(<SyncProgress attempt={attempt({ rawItems: NaN, estimatedTotal: 200 })} />);
    expect(html).toContain('Scanned count unavailable'); expect(html).not.toContain('aria-valuenow');
  });
  it.each(['My channel', undefined, '   '])('keeps normal account identity and read-only truth with title %s', (channelTitle) => {
    const html = renderToStaticMarkup(<ConnectedAccount bootstrap={{ channelId: 'owner-a', channelTitle, likesPlaylistId: 'likes-owner-a' }} />);
    const primary = html.split('<details')[0]!;
    expect(primary).toContain(channelTitle?.trim() || 'YouTube channel'); expect(primary).toContain('read-only');
    expect(primary).not.toContain('owner-a'); expect(html).toContain('Connection details');
    expect(html).toContain('Channel ID: owner-a'); expect(html).not.toContain('<details open');
  });
});
