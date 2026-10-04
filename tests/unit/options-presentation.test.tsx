import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LibraryBrowser, VideoDetail } from '@/src/options/LibraryBrowser';
import { PrivacyNotice, SyncStatus } from '@/src/options/OptionsApp';
import { ATTEMPT_LABELS, failureMessage } from '@/src/options/presentation';
import { failure } from '@/src/runtime/contracts';
import { optionsSnapshot, optionsVideos } from '../fixtures/options';
import { attempt, OBSERVED, success } from '../fixtures/storage';

describe('Options presentation (AC-OPTIONS-001, AC-SYNC-005/007/011/013)', () => {
  it('renders privacy/read-only/retention/controls explanations and real service links', () => {
    const html = renderToStaticMarkup(<PrivacyNotice />);
    expect(html).toContain('read-only'); expect(html).toContain('30-calendar-day');
    expect(html).toContain('https://www.youtube.com/t/terms'); expect(html).toContain('https://policies.google.com/privacy');
  });
  it.each(Object.keys(ATTEMPT_LABELS) as (keyof typeof ATTEMPT_LABELS)[])('renders authoritative %s and previous success independently', (state) => {
    const html = renderToStaticMarkup(<SyncStatus sync={{ ...optionsSnapshot().sync!, currentAttempt: attempt({ state,
      finishedAt: ['preparing', 'scanning', 'applying', 'finalizing'].includes(state) ? null : OBSERVED }), latestSuccessfulSync: success() }} />);
    expect(html).toContain(ATTEMPT_LABELS[state]); expect(html).toContain('Last successful sync:'); expect(html).not.toContain('%');
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
