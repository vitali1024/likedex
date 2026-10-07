import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { dateBoundary, INITIAL_QUERY, type LibraryQuery } from '../library/query';
import { ChannelMultiSelect, type ChannelOption } from './ChannelMultiSelect';
import { SingleSelect } from './SingleSelect';
import { useFloatingSurface } from './useFloatingSurface';

export type PanelFilters = Pick<LibraryQuery, 'channels' | 'dateBasis' | 'from' | 'to'>;
export const initialPanelFilters = (): PanelFilters => ({ channels: [], dateBasis: INITIAL_QUERY.dateBasis, from: '', to: '' });
export function copyPanelFilters(query: PanelFilters): PanelFilters { return { channels: [...query.channels], dateBasis: query.dateBasis, from: query.from, to: query.to }; }
export function panelFilterGroups(query: PanelFilters): number { return Number(query.channels.length > 0) + Number(Boolean(query.from || query.to)); }
export function validPanelDates(draft: PanelFilters): boolean {
  return (!draft.from || dateBoundary(draft.from) !== null) && (!draft.to || dateBoundary(draft.to) !== null)
    && !(draft.from && draft.to && draft.from > draft.to);
}

// Mounted for one editing session only: close/unavailability discards all drafts.
export function FilterPanel({ popupId, committed, options, anchor, onApply, onDismiss }: {
  popupId: string; committed: PanelFilters; options: readonly ChannelOption[]; anchor: RefObject<HTMLButtonElement | null>;
  onApply: (filters: PanelFilters) => void; onDismiss: () => void;
}) {
  const [draft, setDraft] = useState(() => copyPanelFilters(committed));
  const [dateOpen, setDateOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const valid = validPanelDates(draft);
  useFloatingSurface(anchor, popup, 360, 580);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !popup.current?.contains(event.target) && !anchor.current?.contains(event.target)) onDismiss();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [anchor, onDismiss]);
  return <div ref={popup} id={popupId} className="filter-panel floating-surface" popover="manual" role="dialog" aria-labelledby={`${id}-title`}
    onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== anchor.current) onDismiss();
    }} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onDismiss(); anchor.current?.focus(); }
    }}>
    <header className="filter-panel-heading"><h2 id={`${id}-title`}>Filters</h2></header>
    <div className="filter-panel-body">
      <ChannelMultiSelect options={options} selected={draft.channels} onChange={(channels) => setDraft({ ...draft, channels })} />
      <section className="date-section" aria-labelledby={`${id}-date`}><h3 id={`${id}-date`}>Date</h3>
        <div className="filter-field"><span className="field-label">Date basis</span>
          <SingleSelect label="Date basis" value={draft.dateBasis} options={[{ value: 'likedAt', label: 'Liked date' }, { value: 'publishedAt', label: 'Published date' }]}
            open={dateOpen} onOpenChange={setDateOpen} onChange={(dateBasis) => setDraft({ ...draft, dateBasis })} /></div>
        <div className="date-range"><label>From<input type="date" value={draft.from} aria-invalid={!valid || undefined} aria-describedby={!valid ? `${id}-error` : undefined}
          onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
          <label>Through<input type="date" value={draft.to} aria-invalid={!valid || undefined} aria-describedby={!valid ? `${id}-error` : undefined}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label></div>
      </section>
    </div>
    <footer className="filter-panel-footer"><div className="filter-validation">
      {!valid && <p id={`${id}-error`} className="error" role="alert">Choose an end date on or after the start date.</p>}</div>
      <div className="filter-panel-actions"><button type="button" className="filter-clear" onClick={() => setDraft(initialPanelFilters())}>Clear filters</button>
        <button type="button" className="primary filter-apply" disabled={!valid} onClick={() => { if (valid) onApply(copyPanelFilters(draft)); }}>Apply filters</button></div>
    </footer>
  </div>;
}
