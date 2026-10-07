import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { MirroredVideo } from '../domain/contracts';
import { compareText, INITIAL_QUERY, pageOf, queryLibrary, SORTS, youtubeUrl, type LibraryQuery, type Sort } from '../library/query';
import type { LibraryObservation } from '../runtime/observer';
import { failureMessage, formatDate, formatDuration } from './presentation';
import { Disclosure } from './Disclosure';
import { Icon } from './Icon';
import { SingleSelect } from './SingleSelect';
import { channelOptions } from './ChannelMultiSelect';
import { FilterPanel, panelFilterGroups } from './FilterPanel';

const noop = () => {};
const shortDate = (date: string) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function Thumbnail({ video, large = false }: { video: MirroredVideo; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = video.thumbnailUrl;
  const trusted = url !== null && /^https:\/\/i\.ytimg\.com\//.test(url);
  return <span className={`thumbnail ${large ? 'thumbnail-large' : ''}`}>
    {trusted && failedUrl !== url ? <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      : <span className="thumbnail-placeholder" aria-hidden="true"><Icon name="play" /></span>}
    {video.durationSeconds !== null && <span className="duration-badge">{formatDuration(video.durationSeconds)}</span>}
  </span>;
}

function VideoActions({ video, validUntil, onExpired, compact = false }: {
  video: MirroredVideo; validUntil: string | null; onExpired: () => void; compact?: boolean;
}) {
  const [copy, setCopy] = useState('');
  const copying = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const url = youtubeUrl(video.videoId);
  const eligible = () => validUntil === null || Date.now() < Date.parse(validUntil);
  const copyLink = async () => {
    if (!url || copying.current) return;
    if (!eligible()) { onExpired(); return; }
    copying.current = true; setCopy('Copying link…');
    try {
      await navigator.clipboard.writeText(url);
      if (mounted.current && eligible()) setCopy('Link copied.');
      else if (mounted.current) onExpired();
    } catch { if (mounted.current && eligible()) setCopy('Could not copy the link. Try again or use Open on YouTube.'); }
    finally { copying.current = false; }
  };
  return <div className={compact ? 'row-actions' : 'video-actions'}>
    <div className="detail-actions">
      {!compact && url && <a className="button primary" href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => {
        if (!eligible()) { event.preventDefault(); onExpired(); }
      }}><Icon name="external" />Open on YouTube</a>}
      <button className={compact ? 'icon-button' : ''} title="Copy link" aria-label={compact ? `Copy link for ${video.title || 'Title unknown'}` : undefined}
        onClick={() => { void copyLink(); }} disabled={!url || copy === 'Copying link…'}><Icon name={copy === 'Link copied.' ? 'check' : 'copy'} />{!compact && 'Copy link'}</button>
      {compact && url && <a className="button icon-button" href={url} target="_blank" rel="noopener noreferrer" title="Open on YouTube"
        aria-label={`Open ${video.title || 'Title unknown'} on YouTube`} onClick={(event) => {
          if (!eligible()) { event.preventDefault(); onExpired(); }
        }}><Icon name="external" /></a>}
    </div>
    {!url && !compact && <p role="alert">This record has no valid YouTube video link.</p>}
    <p role="status" className={`copy-status ${copy ? 'has-message' : ''}`}>{copy}</p>
  </div>;
}

export function VideoDetail({ video, onBack, validUntil = null, onExpired = noop }: {
  video: MirroredVideo | null; onBack: () => void; validUntil?: string | null; onExpired?: () => void;
}) {
  if (!video) return <aside className="detail" aria-label="Video detail"><div className="detail-placeholder"><Icon name="play" />
    <h2>Select a video</h2><p>Pick a result to preview the thumbnail, open it on YouTube, or copy a direct link from your local library.</p></div></aside>;
  return <aside className="detail" aria-label="Video detail" tabIndex={-1}>
    <button className="back-button" onClick={onBack}><Icon name="chevron" className="reverse" />Back to library</button>
    <div className="detail-content" key={video.videoId}>
      <Thumbnail video={video} large />
      <h2>{video.title || 'Title unknown'}</h2><p className="detail-channel">{video.channelTitle || 'Channel unknown'}</p>
      <VideoActions key={video.videoId} video={video} validUntil={validUntil} onExpired={onExpired} />
      <dl><div><dt><Icon name="heart" />Date liked</dt><dd>{video.likedAt ? formatDate(video.likedAt) : 'Date liked unknown'}</dd></div>
        <div><dt><Icon name="calendar" />Published</dt><dd>{formatDate(video.publishedAt)}</dd></div>
        <div><dt><Icon name="clock" />Duration</dt><dd>{formatDuration(video.durationSeconds)}</dd></div></dl>
      <p className="availability-note"><Icon name="info" />Available at last metadata check. Availability is not a guarantee of playback.</p>
      {video.description && <div className="description"><h3>Description</h3><p>{video.description}</p></div>}
    </div>
  </aside>;
}

const VideoRow = memo(function VideoRow({ video, selected, index, validUntil, onExpired, onSelect, onNavigate, compact, onDetails }: {
  video: MirroredVideo; selected: boolean; index: number; validUntil: string | null; onExpired: () => void;
  onSelect: (id: string, button: HTMLButtonElement) => void; onNavigate: (event: KeyboardEvent<HTMLButtonElement>) => void;
  compact: boolean; onDetails: (button: HTMLButtonElement) => void;
}) {
  return <li className="video-card" data-selected={selected} style={{ '--entrance-delay': `${20 + index * 40}ms` } as CSSProperties}>
    <button className="video-row" aria-pressed={compact ? undefined : selected} aria-expanded={compact ? selected : undefined} aria-controls={compact ? `expanded-${video.videoId}` : undefined} data-video-id={video.videoId} onKeyDown={onNavigate}
      onClick={(event) => onSelect(video.videoId, event.currentTarget)}>
      <Thumbnail video={video} /><span className="row-text"><strong>{video.title || 'Title unknown'}</strong>
        <span>{video.channelTitle || 'Channel unknown'}</span><span className="row-metadata">{video.likedAt ? `Liked ${shortDate(video.likedAt)}` : 'Date liked unknown'}</span></span>
    </button>
    {compact ? <div className="row-expansion" id={`expanded-${video.videoId}`} data-expanded={selected} inert={!selected} aria-hidden={!selected}>
      <div><p className="muted">{formatDuration(video.durationSeconds)} · Published {formatDate(video.publishedAt)}</p>
        <VideoActions video={video} validUntil={validUntil} onExpired={onExpired} />
        <button className="view-details" onClick={(event) => onDetails(event.currentTarget)}>View details<Icon name="chevron" /></button></div>
    </div> : <VideoActions video={video} validUntil={validUntil} onExpired={onExpired} compact />}
  </li>;
});

function pageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const numbers = [...new Set([1, current, Math.min(total, current + 1), total])].sort((a, b) => a - b);
  return numbers.flatMap((n, i) => i && n > numbers[i - 1]! + 1 ? [`gap-${n}`, n] : [n]);
}

export const LibraryBrowser = memo(function LibraryBrowser({ observation, onExpired = noop, compact = false }: { observation: LibraryObservation; onExpired?: () => void; compact?: boolean }) {
  const [query, setQuery] = useState<LibraryQuery>(INITIAL_QUERY);
  const [requestedPage, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [floating, setFloating] = useState<'duration' | 'sort' | 'filters' | null>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const filterId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef(0);
  const pageScrollPosition = useRef(0);
  const lastRow = useRef<HTMLButtonElement | null>(null);
  const snapshot = observation.status === 'ready' ? observation.snapshot : null;
  const videos = snapshot?.videos;
  if (!snapshot && floating !== null) setFloating(null);
  const validUntil = snapshot?.validUntil ?? null;
  const rows = useMemo(() => videos ? queryLibrary(videos, query) : [], [videos, query]);
  const page = useMemo(() => pageOf(rows, requestedPage), [rows, requestedPage]);
  const selected = useMemo(() => rows.find((video) => video.videoId === selectedId) ?? null, [rows, selectedId]);
  const { availableCount, channels } = useMemo(() => {
    const choices = new Map<string, string>();
    let count = 0;
    for (const video of videos ?? []) {
      if (video.availability.state !== 'available') continue;
      count++;
      if (video.channelId === null) continue;
      const label = video.channelTitle || 'Channel name unknown', prior = choices.get(video.channelId);
      if (prior === undefined || compareText(label, prior) < 0) choices.set(video.channelId, label);
    }
    return { availableCount: count, channels: channelOptions([...choices].sort(([a], [b]) => compareText(a, b))) };
  }, [videos]);
  // Never keep rendered Authorized Data across the observer's loading/failure barrier.
  if (observation.status === 'unavailable' && (selectedId !== null || query.channels.length)) {
    setSelectedId(null); setDetailOpen(false); setQuery({ ...query, channels: [] });
    setSelectionNotice('The selected video is unavailable while local data cannot be read.');
  } else if (snapshot && selectedId !== null && !selected) {
    setSelectedId(null); setDetailOpen(false); setSelectionNotice('The selected video is no longer in these results.');
  }
  if (snapshot && requestedPage !== page.page) setPage(page.page);
  const back = useCallback(() => {
    setDetailOpen(false);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollPosition.current;
      window.scrollTo(0, pageScrollPosition.current);
      if (lastRow.current?.isConnected) lastRow.current.focus({ preventScroll: true }); else listRef.current?.focus();
    });
  }, []);
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('dialog[open]')) return;
      if (event.key === 'Escape' && detailOpen && (compact || window.matchMedia('(max-width: 1279px)').matches)) { back(); return; }
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey
        || (target instanceof HTMLElement && (target.closest('input, textarea, select, [role="listbox"], .filter-panel') || target.isContentEditable))) return;
      event.preventDefault();
      if (detailOpen && (compact || window.matchMedia('(max-width: 1279px)').matches)) {
        back(); requestAnimationFrame(() => searchRef.current?.focus());
      } else searchRef.current?.focus();
    };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [back, detailOpen, compact]);
  useEffect(() => {
    if (selectionNotice && document.activeElement === document.body) listRef.current?.focus();
  }, [selectionNotice]);
  const select = useCallback((id: string, button: HTMLButtonElement) => {
    if (validUntil !== null && Date.now() >= Date.parse(validUntil)) { onExpired(); return; }
    lastRow.current = button; scrollPosition.current = scrollRef.current?.scrollTop ?? 0; pageScrollPosition.current = window.scrollY;
    if (compact) { setSelectedId((previous) => previous === id ? null : id); setDetailOpen(false); setSelectionNotice(''); return; }
    setSelectedId(id); setSelectionNotice(''); setDetailOpen(true);
    if (window.matchMedia('(max-width: 1279px)').matches) requestAnimationFrame(() => detailRef.current?.querySelector<HTMLElement>('.detail')?.focus());
  }, [validUntil, onExpired, compact]);
  const openDetails = useCallback((button: HTMLButtonElement) => {
    if (validUntil !== null && Date.now() >= Date.parse(validUntil)) { onExpired(); return; }
    lastRow.current = button; scrollPosition.current = scrollRef.current?.scrollTop ?? 0; pageScrollPosition.current = window.scrollY; setDetailOpen(true);
    requestAnimationFrame(() => detailRef.current?.querySelector<HTMLElement>('.detail')?.focus());
  }, [validUntil, onExpired]);
  const navigate = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('.video-row') ?? []);
    const index = buttons.indexOf(event.currentTarget);
    const next = buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (!next?.dataset.videoId) return;
    next.focus();
    if (!compact && window.matchMedia('(min-width: 1280px)').matches) select(next.dataset.videoId, next);
  }, [select, compact]);
  const update = (patch: Partial<LibraryQuery>) => { setQuery({ ...query, ...patch }); setPage(1); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const hasFilters = Boolean(query.channels.length || query.duration || query.from || query.to);
  const panelFilterCount = snapshot ? panelFilterGroups(query) : 0;
  const canReset = Boolean(query.search || query.duration || query.channels.length || query.from || query.to
    || query.dateBasis !== INITIAL_QUERY.dateBasis || query.sort !== INITIAL_QUERY.sort || requestedPage !== 1 || selectedId || detailOpen || selectionNotice);
  const resetView = () => {
    setQuery({ ...INITIAL_QUERY, channels: [] }); setPage(1); setSelectedId(null); setDetailOpen(false); setSelectionNotice(''); setFloating(null);
    lastRow.current = null; scrollPosition.current = 0; pageScrollPosition.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    window.scrollTo(0, 0);
    // A focused detail route hides the toolbar until this reset has rendered.
    requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  };
  const resetButton = () => <button type="button" className="reset-view" title="Reset search, filters, sort and current view"
    disabled={!snapshot || !canReset} onClick={resetView}><Icon name="sync" />Reset view</button>;
  const changePage = (next: number) => { setPage(next); if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  return <section className={`library ${detailOpen && selected ? 'detail-open' : ''}`} aria-label="Local library">
    <div className="toolbar">
      <div className="search-control"><Icon name="search" />
        <input ref={searchRef} type="search" aria-label="Search library" placeholder={snapshot ? `Search ${availableCount.toLocaleString()} available videos…` : 'Search titles and channels'} value={query.search}
          onChange={(event) => update({ search: event.target.value })} disabled={!snapshot} />
        <div className="search-actions">{query.search && <button className="icon-button" aria-label="Clear search" onClick={() => { update({ search: '' }); searchRef.current?.focus(); }}><Icon name="close" /></button>}
          <button className="shortcut" title="Press / to focus search" aria-label="Focus search" onClick={() => searchRef.current?.focus()}>/</button></div>
      </div>
      <div className="duration-control"><SingleSelect label="Duration" value={query.duration} disabled={!snapshot}
        options={[{ value: '', label: 'Any duration' }, { value: 'short', label: 'Under 4 minutes' }, { value: 'medium', label: '4 to under 20 minutes' }, { value: 'long', label: '20 minutes or longer' }]}
        open={floating === 'duration'} onOpenChange={(open) => setFloating(open ? 'duration' : null)} onChange={(duration) => update({ duration })} /></div>
      <div className="filters"><button ref={filterTrigger} type="button" className="filter-trigger" aria-label="Filter library" aria-haspopup="dialog"
        aria-expanded={floating === 'filters'} aria-controls={floating === 'filters' ? filterId : undefined} disabled={!snapshot} data-active={panelFilterCount > 0 || undefined}
        onClick={() => setFloating(floating === 'filters' ? null : 'filters')}><Icon name="filter" /><span>Filter library</span>
        <span className="filter-count" data-empty={!panelFilterCount || undefined} aria-hidden={!panelFilterCount || undefined}><span className="sr-only">Active filter groups: </span>{panelFilterCount || ''}</span>
        <Icon name="down" className="control-chevron" /></button>
        {floating === 'filters' && snapshot && <FilterPanel popupId={filterId} committed={query} options={channels} anchor={filterTrigger} onDismiss={() => setFloating(null)}
          onApply={(draft) => { update(draft); setFloating(null); filterTrigger.current?.focus({ preventScroll: true }); }} />}</div>
      <div className="sort-control"><SingleSelect label="Sort" prefix="Sort: " value={query.sort} disabled={!snapshot}
        options={Object.entries(SORTS).map(([value, label]) => ({ value: value as Sort, label }))}
        open={floating === 'sort'} onOpenChange={(open) => setFloating(open ? 'sort' : null)} onChange={(sort) => update({ sort })} /></div>
      {resetButton()}
    </div>
    {hasFilters && snapshot && <div className="active-filters" aria-label="Active filters">
      {query.duration && <button onClick={() => update({ duration: '' })}>Duration: {query.duration}<Icon name="close" /></button>}
      {snapshot && query.channels.map((id) => { const option = channels.find((channel) => channel.id === id); return <button key={id}
        onClick={() => update({ channels: query.channels.filter((channel) => channel !== id) })}>{option?.title ?? 'Channel name unknown'}
        {option?.disambiguator && <span className="chip-identifier">{option.disambiguator}</span>}<Icon name="close" /></button>; })}
      {(query.from || query.to) && <button onClick={() => update({ from: '', to: '' })}>{query.dateBasis === 'likedAt' ? 'Liked' : 'Published'}: {query.from || 'Any'} – {query.to || 'Any'}<Icon name="close" /></button>}
    </div>}
    <div className="library-split">
      <section className="results" aria-label="Library results" ref={listRef} tabIndex={-1}>
        <div className="results-heading"><h2>{snapshot ? <><span>{rows.length.toLocaleString()} results</span> in available videos</> : 'Library'}</h2>
          {snapshot && <Disclosure className="count-info" label={<><Icon name="info" /><span className="sr-only">About library counts</span></>}>
            <p>{availableCount} available videos · {snapshot.videos.length} mirrored memberships</p><p className="muted">Private, deleted, and unknown-availability memberships stay out of the main list. Counts reflect the local snapshot.</p>
          </Disclosure>}</div>
        <div className="results-scroll" ref={scrollRef}>
          {observation.status === 'loading' && <div className="loading-state"><p role="status">Loading local snapshot…</p><div aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <div className="skeleton-row" key={i}><span /><div><i /><i /><i /></div></div>)}</div></div>}
          {observation.status === 'unavailable' && <div className="empty error" role="alert"><Icon name="info" /><h3>Library unavailable</h3><p>{failureMessage(observation.error)}</p><p>No valid library count is available.</p></div>}
          {snapshot && rows.length === 0 && <div className="empty"><Icon name="search" />
            {availableCount > 0 ? <><h3>No matching videos</h3><p>Try another search or clear your search and filters.</p><button onClick={resetView}>Clear search and filters</button></>
              : snapshot.videos.length > 0 ? <><h3>No available videos</h3><p>Membership is mirrored, but no video has available metadata from the last check.</p></>
                : snapshot.sync?.latestSuccessfulSync ? <><h3>Your local mirror is empty</h3><p>The latest successful sync is recorded above. This is a local snapshot, not a live YouTube count.</p></>
                  : snapshot.sync?.currentAttempt ? <><h3>No local videos yet</h3><p>See the current or latest sync result above. This does not mean your YouTube library is empty.</p></>
                    : <><h3>No local mirror yet</h3><p>When connected, use Sync to create your local library.</p></>}
          </div>}
          {snapshot && <ul className="video-list">{page.rows.map((video, index) => <VideoRow key={video.videoId} video={video} index={index} selected={video.videoId === selectedId}
            validUntil={validUntil} onExpired={onExpired} onSelect={select} onNavigate={navigate} compact={compact} onDetails={openDetails} />)}</ul>}
        </div>
        <p role="status" className="selection-notice muted">{selectionNotice}</p>
        <div className="results-footer"><span className="muted">{snapshot ? `${availableCount} available videos · ${snapshot.videos.length} mirrored memberships` : 'Counts unavailable'}</span>
          <nav className="pagination" aria-label="Library pagination">
            <button className="icon-button" aria-label="Previous page" disabled={!snapshot || page.page === 1} onClick={() => changePage(page.page - 1)}><Icon name="chevron" className="reverse" /></button>
            {snapshot && pageNumbers(page.page, page.pages).map((number) => typeof number === 'number' ? <button key={number} aria-label={`Go to page ${number}`} aria-current={number === page.page ? 'page' : undefined} onClick={() => changePage(number)}>{number}</button> : <span key={number}>…</span>)}
            <button className="icon-button" aria-label="Next page" disabled={!snapshot || rows.length === 0 || page.page === page.pages} onClick={() => changePage(page.page + 1)}><Icon name="chevron" /></button>
            <span className="page-label">{snapshot ? `Page ${page.page} of ${page.pages}` : 'Pages unavailable'}</span>
          </nav>
        </div>
      </section>
      <div className="detail-host" ref={detailRef}><div className="detail-reset-control">{resetButton()}</div><VideoDetail key={selected?.videoId ?? 'none'} video={selected} onBack={back} validUntil={validUntil} onExpired={onExpired} /></div>
    </div>
  </section>;
});
