import { useId, useMemo, useRef, useState } from 'react';
import { normalize } from '../library/query';
import { Icon } from './Icon';

export interface ChannelOption { id: string; title: string; disambiguator: string | null }

// Keep the caller's stable-ID ordering. IDs are visible only for colliding names.
export function channelOptions(choices: readonly (readonly [string, string])[]): ChannelOption[] {
  const titles = choices.map(([id, title]) => ({ id, title: title.trim() || 'Channel name unknown' }));
  const counts = new Map<string, number>();
  for (const { title } of titles) counts.set(normalize(title), (counts.get(normalize(title)) ?? 0) + 1);
  return titles.map((option) => ({ ...option, disambiguator: counts.get(normalize(option.title))! > 1 ? option.id : null }));
}

export function channelSelectionLabel(selected: readonly string[]): string {
  if (!selected.length) return 'All channels';
  return `${selected.length} selected`;
}

export function ChannelMultiSelect({ options, selected, onChange, disabled = false }: {
  options: readonly ChannelOption[]; selected: readonly string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const matches = useMemo(() => {
    const term = normalize(search);
    return options.filter((option) => normalize(`${option.title} ${option.id}`).includes(term));
  }, [options, search]);
  return <section className="channel-section" aria-labelledby={`${id}-label`}>
    <div className="channel-heading"><div><h3 id={`${id}-label`}>Channels</h3><span className="muted">{channelSelectionLabel(selected)}</span></div>
      <button type="button" className="channel-clear" aria-label="Clear channels" disabled={!selected.length || disabled}
        onClick={() => { onChange([]); searchInput.current?.focus(); }}>Clear</button></div>
      <label className="sr-only" htmlFor={`${id}-search`}>Search channels</label>
      <div className="channel-search"><Icon name="search" /><input ref={searchInput} id={`${id}-search`} type="search"
        data-initial-focus disabled={disabled} placeholder="Search channels…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="channel-options">
        {matches.map((option) => <label className="channel-option" key={option.id}>
          <input type="checkbox" disabled={disabled} checked={selected.includes(option.id)} onChange={(event) => onChange(event.target.checked
            ? [...selected, option.id] : selected.filter((value) => value !== option.id))} />
          <span>{option.title}{option.disambiguator && <small>{option.disambiguator}</small>}</span>
        </label>)}
        {!matches.length && <p className="muted channel-empty">No matching channels</p>}
      </div>
  </section>;
}
