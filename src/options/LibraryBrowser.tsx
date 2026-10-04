import { useEffect, useMemo, useRef, useState } from 'react';
import type { MirroredVideo } from '../domain/contracts';
import { compareText, INITIAL_QUERY, pageOf, queryLibrary, SORTS, youtubeUrl, type LibraryQuery, type Sort } from '../library/query';
import type { LibraryObservation } from '../runtime/observer';
import { failureMessage, formatDate, formatDuration } from './presentation';

function Thumbnail({ video, large = false }: { video: MirroredVideo; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = video.thumbnailUrl;
  const trusted = url !== null && /^https:\/\/i\.ytimg\.com\//.test(url);
  return <span className={`thumbnail ${large ? 'thumbnail-large' : ''}`}>
    {trusted && failedUrl !== url ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      : <span className="thumbnail-placeholder" aria-hidden="true">▶</span>}
  </span>;
}
export function VideoDetail({ video, onBack, validUntil = null, onExpired = () => {} }: {
  video: MirroredVideo | null; onBack: () => void; validUntil?: string | null; onExpired?: () => void;
}) {
  const [copy, setCopy] = useState('');
  const copying = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!video) return <aside className="detail" aria-label="Video detail"><div className="detail-placeholder"><span aria-hidden="true">↗</span>
    <h2>Select a video</h2><p>Inspect its details, open it on YouTube, or copy its link.</p></div></aside>;
  const url = youtubeUrl(video.videoId);
  const eligible = () => validUntil === null || Date.now() < Date.parse(validUntil);
  const copyLink = async () => {
    if (!url || copying.current) return;
    if (!eligible()) { onExpired(); return; }
    copying.current = true; setCopy('Copying link…');
    try { await navigator.clipboard.writeText(url); if (mounted.current) setCopy('Link copied.'); }
    catch { if (mounted.current) setCopy('Could not copy the link. Try again or use Open on YouTube.'); }
    finally { copying.current = false; }
  };
  return <aside className="detail" aria-label="Video detail" tabIndex={-1}>
    <button className="back-button" onClick={onBack}>← Back to library</button>
    <Thumbnail video={video} large />
    <p className="eyebrow">Selected video</p><h2>{video.title || 'Title unknown'}</h2>
    <p className="detail-channel">{video.channelTitle || 'Channel unknown'}</p>
    <dl><div><dt>Date liked</dt><dd>{video.likedAt ? formatDate(video.likedAt) : 'Date liked unknown'}</dd></div>
      <div><dt>Published</dt><dd>{formatDate(video.publishedAt)}</dd></div>
      <div><dt>Duration</dt><dd>{formatDuration(video.durationSeconds)}</dd></div>
      <div><dt>Availability</dt><dd>Available at last metadata check</dd></div></dl>
    <p className="muted">Availability is not a guarantee of playback.</p>
    <div className="detail-actions">{url ? <a className="button primary" href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => {
      if (!eligible()) { event.preventDefault(); onExpired(); }
    }}>Open on YouTube ↗</a>
      : <p role="alert">This record has no valid YouTube video link.</p>}
      <button onClick={() => { void copyLink(); }} disabled={!url || copy === 'Copying link…'}>Copy link</button></div>
    <p role="status" className="copy-status">{copy}</p>
    {video.description && <div className="description"><h3>Description</h3><p>{video.description}</p></div>}
  </aside>;
}

export function LibraryBrowser({ observation, onExpired = () => {} }: { observation: LibraryObservation; onExpired?: () => void }) {
  const [query, setQuery] = useState<LibraryQuery>(INITIAL_QUERY);
  const [requestedPage, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const lastRow = useRef<HTMLButtonElement | null>(null);
  const snapshot = observation.status === 'ready' ? observation.snapshot : null;
  const rows = useMemo(() => snapshot ? queryLibrary(snapshot.videos, query) : [], [snapshot, query]);
  const page = pageOf(rows, requestedPage);
  const selected = rows.find((video) => video.videoId === selectedId) ?? null;
  // Only a completed read can invalidate selection during ordinary refresh.
  // Failure discards IDs and channel choices rather than retaining stale data.
  if (observation.status === 'unavailable' && (selectedId !== null || query.channels.length)) {
    setSelectedId(null); setDetailOpen(false); setQuery({ ...query, channels: [] });
    setSelectionNotice('The selected video is unavailable while local data cannot be read.');
  } else if (snapshot && selectedId !== null && !selected) {
    setSelectedId(null); setDetailOpen(false); setSelectionNotice('The selected video is no longer in these results.');
  }
  if (snapshot && requestedPage !== page.page) setPage(page.page);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey
        || (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable))) return;
      event.preventDefault(); searchRef.current?.focus();
    };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (selectionNotice && window.matchMedia('(max-width: 760px)').matches && document.activeElement === document.body) {
      listRef.current?.focus();
    }
  }, [selectionNotice]);
  const update = (patch: Partial<LibraryQuery>) => { setQuery({ ...query, ...patch }); setPage(1); };
  const clearFilters = () => update({ channels: [], duration: '', from: '', to: '' });
  const availableCount = snapshot?.videos.filter((video) => video.availability.state === 'available').length ?? 0;
  const channels = new Map<string, string>();
  for (const video of snapshot?.videos ?? []) {
    if (video.availability.state === 'available' && video.channelId !== null) {
      const label = video.channelTitle || 'Channel name unknown';
      const prior = channels.get(video.channelId);
      if (prior === undefined || compareText(label, prior) < 0) channels.set(video.channelId, label);
    }
  }
  const back = () => {
    setDetailOpen(false);
    requestAnimationFrame(() => { if (lastRow.current?.isConnected) lastRow.current.focus(); else listRef.current?.focus(); });
  };
  return <section className={`library ${detailOpen && selected ? 'detail-open' : ''}`} aria-label="Local library">
    <div className="toolbar">
      <label className="search-control">Search library <span className="muted">/</span>
        <input ref={searchRef} type="search" aria-label="Search library" placeholder="Search titles and channels" value={query.search}
          onChange={(event) => update({ search: event.target.value })} disabled={!snapshot} /></label>
      <label>Sort<select aria-label="Sort" value={query.sort} onChange={(event) => update({ sort: event.target.value as Sort })} disabled={!snapshot}>
        {Object.entries(SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <details className="filters"><summary>Filter library</summary><div className="filter-controls">
      <label>Channels<select aria-label="Channels" multiple size={3} value={query.channels} disabled={!snapshot} onChange={(event) =>
        update({ channels: Array.from(event.target.selectedOptions, (option) => option.value) })}>
        {[...channels].sort(([a], [b]) => compareText(a, b)).map(([id, title]) =>
          <option key={id} value={id}>{title} · {id}</option>)}
      </select><span className="muted">Choose one or more; none means all.</span></label>
      <label>Duration<select aria-label="Duration" value={query.duration} disabled={!snapshot} onChange={(event) => update({ duration: event.target.value as LibraryQuery['duration'] })}>
        <option value="">Any duration</option><option value="short">Under 4 minutes</option>
        <option value="medium">4 to under 20 minutes</option><option value="long">20 minutes or longer</option></select></label>
      <label>Date basis<select aria-label="Date basis" value={query.dateBasis} disabled={!snapshot} onChange={(event) => update({ dateBasis: event.target.value as LibraryQuery['dateBasis'] })}>
        <option value="likedAt">Liked date</option><option value="publishedAt">Published date</option></select></label>
      <label>From<input type="date" value={query.from} disabled={!snapshot} onChange={(event) => update({ from: event.target.value })} /></label>
      <label>Through<input type="date" value={query.to} disabled={!snapshot} onChange={(event) => update({ to: event.target.value })} /></label>
      <button onClick={clearFilters} disabled={!snapshot}>Clear filters</button>
    </div><p className="muted">Dates include both selected local-calendar days. Unknown values do not match an active filter. Publication date never substitutes for date liked.</p>
      {query.from && query.to && query.from > query.to && <p role="alert">Choose an end date on or after the start date.</p>}</details>
    <div className="library-split">
      <section className="results" aria-label="Library results" ref={listRef} tabIndex={-1}>
        <div className="results-heading"><h2>Library</h2>{snapshot && <span>{rows.length} results · {availableCount} available videos · {snapshot.videos.length} mirrored memberships</span>}</div>
        {observation.status === 'loading' && <p role="status" className="empty">Loading local snapshot…</p>}
        {observation.status === 'unavailable' && <div className="empty error" role="alert"><h3>Library unavailable</h3><p>{failureMessage(observation.error)}</p><p>No valid library count is available.</p></div>}
        {snapshot && rows.length === 0 && <div className="empty">
          {availableCount > 0 ? <><h3>No matching videos</h3><p>Try another search or clear your search and filters.</p>
            <button onClick={() => { setQuery(INITIAL_QUERY); setPage(1); }}>Clear search and filters</button></>
            : snapshot.videos.length > 0 ? <><h3>No available videos</h3><p>Membership is mirrored, but no video has available metadata from the last check.</p></>
              : snapshot.sync?.latestSuccessfulSync ? <><h3>Your local mirror is empty</h3><p>The latest successful sync is recorded above. This is a local snapshot, not a live YouTube count.</p></>
                : snapshot.sync?.currentAttempt ? <><h3>No local videos yet</h3><p>See the current or latest sync result above. This does not mean your YouTube library is empty.</p></>
                  : <><h3>No local mirror yet</h3><p>When connected, use Sync to create your local library.</p></>}
        </div>}
        {snapshot && <ul className="video-list">{page.rows.map((video) => <li key={video.videoId}>
          <button className="video-row" aria-pressed={video.videoId === selectedId} onClick={(event) => {
            if (snapshot.validUntil !== null && Date.now() >= Date.parse(snapshot.validUntil)) { onExpired(); return; }
            lastRow.current = event.currentTarget; setSelectedId(video.videoId); setSelectionNotice(''); setDetailOpen(true);
            if (window.matchMedia('(max-width: 760px)').matches) requestAnimationFrame(() => document.querySelector<HTMLElement>('.detail')?.focus());
          }}>
            <Thumbnail video={video} /><span className="row-text"><strong>{video.title || 'Title unknown'}</strong>
              <span>{video.channelTitle || 'Channel unknown'}</span><span className="row-metadata">{formatDuration(video.durationSeconds)} · {video.likedAt ? `Liked ${formatDate(video.likedAt)}` : 'Date liked unknown'}
                {video.publishedAt && ` · Published ${formatDate(video.publishedAt)}`}</span></span>
          </button></li>)}</ul>}
        <p role="status" className="muted">{selectionNotice}</p>
        <nav className="pagination" aria-label="Library pagination">
          <button disabled={!snapshot || page.page === 1} onClick={() => setPage(page.page - 1)}>Previous page</button>
          <span>{snapshot ? `Page ${page.page} of ${page.pages}` : 'Pages unavailable'}</span>
          <button disabled={!snapshot || rows.length === 0 || page.page === page.pages} onClick={() => setPage(page.page + 1)}>Next page</button>
        </nav>
      </section>
      <VideoDetail key={selected?.videoId ?? 'none'} video={selected} onBack={back} validUntil={snapshot?.validUntil ?? null} onExpired={onExpired} />
    </div>
  </section>;
}
