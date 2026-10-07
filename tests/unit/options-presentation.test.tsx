import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LibraryBrowser, VideoDetail } from '@/src/options/LibraryBrowser';
import { PrivacyNotice, SyncStatus } from '@/src/options/OptionsApp';
import { ATTEMPT_LABELS, failureMessage } from '@/src/options/presentation';
import { ConnectedAccount } from '@/src/options/ConnectedAccount';
import { SyncProgress } from '@/src/options/SyncProgress';
import { ChannelMultiSelect, channelOptions, channelSelectionLabel } from '@/src/options/ChannelMultiSelect';
import { SingleSelect } from '@/src/options/SingleSelect';
import { copyPanelFilters, initialPanelFilters, panelFilterGroups, validPanelDates } from '@/src/options/FilterPanel';
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

describe('Handoff C.1 themed selects, direct channels and drafts', () => {
  const choices = channelOptions([['a', 'Travel'], ['b', 'Music']]);
  it.each(['Duration', 'Sort', 'Date basis'])('renders %s as one named themed trigger with one chevron', (label) => {
    const html = renderToStaticMarkup(<SingleSelect label={label} value="a" options={[{ value: 'a', label: 'Choice' }]}
      open={false} onOpenChange={() => {}} onChange={() => {}} />);
    expect(html).toContain(`aria-label="${label}"`); expect(html).not.toContain('<select');
    expect(html.match(/<svg/g)).toHaveLength(1); expect(html).toContain('control-chevron');
    expect(html).toContain('aria-hidden="true"'); expect(html).toContain('aria-haspopup="listbox"');
  });
  it('preserves stable-ID ordering and hides ordinary IDs', () => {
    expect(choices).toEqual([{ id: 'a', title: 'Travel', disambiguator: null }, { id: 'b', title: 'Music', disambiguator: null }]);
  });
  it('disambiguates duplicate normalized names with full exact IDs', () => {
    expect(channelOptions([['UC-a-same-suffix', 'Music'], ['UC-b-same-suffix', 'ＭＵＳＩＣ']]).map((option) => option.disambiguator))
      .toEqual(['UC-a-same-suffix', 'UC-b-same-suffix']);
  });
  it('uses truthful missing-name fallback, disambiguating only collisions', () => {
    expect(channelOptions([['a', '']])[0]).toEqual({ id: 'a', title: 'Channel name unknown', disambiguator: null });
    expect(channelOptions([['a', ''], ['b', '   ']]).map((option) => option.disambiguator)).toEqual(['a', 'b']);
  });
  it.each([[[], 'All channels'], [['a'], '1 selected'], [['a', 'b'], '2 selected'], [['missing'], '1 selected']] as const)(
    'summarizes selected IDs %j as %s', (selected, label) => { expect(channelSelectionLabel(selected)).toBe(label); });
  it('renders direct named search/checkboxes with no nested trigger or contradictory roles', () => {
    const html = renderToStaticMarkup(<ChannelMultiSelect options={choices} selected={[]} onChange={() => {}} />);
    expect(html).toContain('All channels'); expect(html).toContain('Search channels'); expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).not.toContain('aria-expanded'); expect(html).not.toContain('role="combobox"'); expect(html).not.toContain('role="listbox"');
  });
  it('renders only disabled empty controls without an eligible snapshot or provider labels', () => {
    const html = renderToStaticMarkup(<LibraryBrowser observation={{ status: 'loading' }} />);
    expect(html).toContain('disabled=""'); expect(html).not.toContain('channel-section'); expect(html).not.toContain('Travel');
    expect(html).not.toContain('Music'); expect(html).not.toContain('multiple=');
  });
  it('restores Reset view and retains no permanent helper prose/native selects', () => {
    const html = renderToStaticMarkup(<LibraryBrowser observation={{ status: 'ready', snapshot: optionsSnapshot() }} />);
    expect(html.match(/class="single-select"/g)).toHaveLength(2);
    expect(html).toContain('Reset view'); expect(html).toContain('Reset search, filters, sort and current view'); expect(html).not.toContain('Choose one or more');
    expect(html).not.toContain('Dates include both'); expect(html).not.toContain('multiple=');
  });
  it('exposes a single selected marker/semantic state and active current choice in the listbox', () => {
    const html = renderToStaticMarkup(<SingleSelect label="Sort" value="b" options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]}
      open onOpenChange={() => {}} onChange={() => {}} />);
    expect(html).toContain('role="listbox"'); expect(html.match(/role="option"/g)).toHaveLength(2);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1); expect(html).toContain('data-active="true" data-value="b"');
    expect(html).toContain('aria-activedescendant='); expect(html).toContain('popover="manual"');
  });
  it('copies only panel-owned fields and does not share the committed channel array', () => {
    const committed = { channels: ['a'], dateBasis: 'publishedAt' as const, from: '2026-09-01', to: '2026-09-15', duration: 'medium', search: 'video', sort: 'title' };
    const draft = copyPanelFilters(committed); draft.channels.push('b');
    expect(committed.channels).toEqual(['a']); expect(draft).toEqual({ channels: ['a', 'b'], dateBasis: 'publishedAt', from: '2026-09-01', to: '2026-09-15' });
    expect(initialPanelFilters()).toEqual({ channels: [], dateBasis: 'likedAt', from: '', to: '' });
  });
  it.each([[[], '', '', 0], [['a', 'b', 'c'], '', '', 1], [[], '2026-09-01', '', 1], [['a'], '', '2026-09-15', 2]] as const)(
    'counts filter groups for %j / %s / %s', (channels, from, to, count) => {
      expect(panelFilterGroups({ channels: [...channels], dateBasis: 'likedAt', from, to })).toBe(count);
    });
  it.each([['', '', true], ['2026-09-15', '2026-09-15', true], ['2026-09-16', '2026-09-15', false], ['2026-02-30', '', false]])(
    'validates draft dates %s through %s', (from, to, valid) => { expect(validPanelDates({ ...initialPanelFilters(), from, to })).toBe(valid); });
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
    expect(primary).toContain('Sync complete'); expect(primary).toContain('2 mirrored');
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
    const primary = html.split('</summary>')[0]!;
    expect(primary).toContain(channelTitle?.trim() || 'YouTube channel'); expect(primary).toContain('Read-only'); expect(primary).toContain('Connected');
    expect(primary).not.toContain('owner-a'); expect(html).toContain('Connection details');
    expect(html).toContain('<dt>Channel ID</dt><dd class="channel-id">owner-a</dd>'); expect(html).not.toContain('<details open');
  });
});

describe('Handoff D+ structured details and library polish', () => {
  const render = (currentAttempt: ReturnType<typeof attempt> | null, latestSuccessfulSync = success()) =>
    renderToStaticMarkup(<SyncStatus sync={{ ...optionsSnapshot().sync!, currentAttempt, latestSuccessfulSync }} />);
  it('combines matching success diagnostics and finalized results once with truthful labels', () => {
    const html = render(attempt({ state: 'success', finishedAt: OBSERVED, estimatedTotal: 3548, rawItems: 3548, uniqueMembership: 3400 }));
    for (const group of ['Status', 'Scan', 'Library snapshot', 'Changes', 'Timing']) expect(html).toContain(`<h4>${group}</h4>`);
    expect(html.match(/<h4>Changes<\/h4>/g)).toHaveLength(1);
    expect(html.match(/<dt>Completed<\/dt>/g)).toHaveLength(1);
    expect(html).toContain('<dt>Provider estimate</dt><dd>~3,548</dd>');
    expect(html).toContain('<dt>Unique videos observed</dt><dd>3,400</dd>');
    expect(html).toContain('<dt>Refreshed</dt>'); expect(html).toContain('<dt>Removed</dt>');
    expect(html).not.toContain('Current attempt'); expect(html).not.toContain('Last successful snapshot');
    expect(html).not.toContain(' updated'); expect(html).not.toContain('raw items processed');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('role="status">Sync complete</p>');
  });
  it.each(['ownerChannelId', 'dataGeneration'] as const)('keeps success events separate on %s mismatch', (field) => {
    const html = render(attempt({ state: 'success', finishedAt: OBSERVED,
      ...(field === 'ownerChannelId' ? { ownerChannelId: 'other-owner' } : { dataGeneration: 1 }) }));
    expect(html).toContain('Current attempt'); expect(html).toContain('Last successful snapshot');
    expect(html.match(/<h4>Changes<\/h4>/g)).toHaveLength(2);
    expect(html.split('<details')[0]).not.toContain('class="sync-metric"');
  });
  it('shows a durable snapshot without an attempt, without inventing an estimate', () => {
    const html = render(null);
    expect(html).toContain('<dt>Pages scanned</dt>'); expect(html).toContain('<dt>Unique videos observed</dt>');
    expect(html).not.toContain('Provider estimate'); expect(html).not.toContain('Current attempt');
    expect(html.match(/<h4>Changes<\/h4>/g)).toHaveLength(1);
  });
  it('keeps active diagnostics and retry separate from previous results, with no attempt removals', () => {
    const html = render(attempt({ retrying: true }));
    expect(html).toContain('Current sync'); expect(html).toContain('Previous successful snapshot');
    const current = html.split('Previous successful snapshot')[0]!;
    expect(current).toContain('<dt>Pages processed</dt>'); expect(current).toContain('Retrying a temporary request');
    expect(current).toContain('<dt>Checkpoint</dt>'); expect(current).not.toContain('<dt>Removed</dt>');
    expect(html.match(/role="progressbar"/g)).toHaveLength(1);
  });
  it('keeps a later failure and its earlier finalized snapshot distinct', () => {
    const html = render(attempt({ state: 'failure', attemptId: NEXT_ATTEMPT_ID, finishedAt: OBSERVED,
      error: { category: 'network', messageKey: 'network-failed', phase: 'scanning' } }));
    expect(html).toContain('role="status">Sync failed'); expect(html).toContain('role="alert"');
    expect(html).toContain('Current attempt'); expect(html).toContain('Last successful snapshot');
    expect(html).toContain('Last successful sync:'); expect(html).toContain('<dt>Finished</dt>');
    expect(html.split('Last successful snapshot')[0]).not.toContain('<dt>Removed</dt>');
  });
  it('renders neutral no-success details without empty metric groups', () => {
    const html = renderToStaticMarkup(<SyncStatus sync={null} />);
    expect(html).toContain('data-tone="idle"'); expect(html).toContain('Never synced');
    expect(html).toContain('No successful sync recorded.'); expect(html).not.toContain('<dl');
  });
  it('places availability context once in counts disclosure and keeps pagination free of counts', () => {
    const html = renderToStaticMarkup(<LibraryBrowser observation={{ status: 'ready', snapshot: optionsSnapshot() }} />);
    expect(html.match(/Availability reflects the last metadata check/g)).toHaveLength(1);
    expect(html).toContain('62 available videos · 62 mirrored memberships');
    const footer = html.split('class="results-footer"')[1]!.split('</nav>')[0]!;
    expect(footer).toContain('Library pagination'); expect(footer).not.toContain('available videos'); expect(footer).not.toContain('mirrored memberships');
    const detail = renderToStaticMarkup(<VideoDetail video={optionsVideos()[0]!} onBack={() => {}} />);
    expect(detail).not.toContain('Availability'); expect(detail).not.toContain('availability-note');
  });
});

describe('Handoff D+.1 quiet status fields', () => {
  it('keeps mirror size and freshness in separate semantic elements outside the phase live region', () => {
    const html = renderToStaticMarkup(<SyncStatus sync={optionsSnapshot().sync} />);
    const primary = html.split('<details')[0]!;
    expect(primary).toContain('<p class="sync-metric">2 mirrored</p>');
    expect(primary).toContain('<p class="sync-updated muted">Updated <time');
    expect(primary).toContain('role="status">Sync complete</p>');
    expect(primary.match(/role="status"/g)).toHaveLength(1);
    expect(primary).not.toMatch(/[·|]/); expect(primary).not.toContain('liked videos mirrored');
  });
  it('removes the account eyebrow and bordered Connected chip while retaining explicit trust text', () => {
    const html = renderToStaticMarkup(<ConnectedAccount bootstrap={{ channelId: 'owner-a', channelTitle: 'My channel', likesPlaylistId: 'likes-owner-a' }} />);
    const primary = html.split('</summary>')[0]!;
    expect(primary).toContain('<span class="account-name">My channel</span>');
    expect(primary).toContain('aria-label="Connection details for My channel"'); expect(primary).toContain('Connected to YouTube. Read-only access.');
    expect(primary).toContain('<span class="status-chip">Read-only</span>');
    expect(primary).not.toContain('YouTube account'); expect(primary).not.toContain('connected-chip');
    expect(primary).not.toMatch(/[·|]/); expect(primary).not.toContain('role="status"');
  });
});

describe('Handoff D+.2 header status disclosures', () => {
  it('omits mirror diagnostics from the closed header while retaining structured exact counts', () => {
    const html = renderToStaticMarkup(<SyncStatus sync={optionsSnapshot().sync} mode="header" />);
    const trigger = html.split('</summary>')[0]!;
    expect(trigger).toContain('aria-label="Sync details"'); expect(trigger).toContain('Sync complete');
    expect(trigger).toContain('class="sync-updated muted">Updated <time');
    expect(trigger).not.toContain('mirrored'); expect(trigger).not.toContain('sync-metric'); expect(trigger).not.toMatch(/[·|]/);
    expect(html).toContain('<dt>Mirrored videos</dt><dd>2</dd>');
    expect(html).toContain('<dt>Available videos</dt><dd>1</dd>');
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });
  it('keeps progress and exceptions below the header with one phase live region and one disclosure', () => {
    const sync = { ...optionsSnapshot().sync!, currentAttempt: attempt({ retrying: true, rawItems: 100, estimatedTotal: 200 }) };
    const header = renderToStaticMarkup(<SyncStatus sync={sync} mode="header" />);
    const strip = renderToStaticMarkup(<SyncStatus sync={sync} mode="strip" />);
    expect(header).toContain('Scanning liked videos'); expect(header).toContain('Retrying a temporary request');
    expect(header).not.toContain('role="progressbar"'); expect(strip).toContain('aria-valuenow="50"');
    expect(strip).not.toContain('<details'); expect(strip).not.toContain('role="status"');
    expect(header.match(/role="status"/g)).toHaveLength(1);
  });
  it('keeps neutral never-synced header free of invented counts or freshness', () => {
    const html = renderToStaticMarkup(<SyncStatus sync={null} mode="header" />);
    expect(html).toContain('Never synced'); expect(html).toContain('No successful sync recorded.');
    expect(html).not.toContain('<time'); expect(html).not.toContain('Mirrored videos');
  });
});
