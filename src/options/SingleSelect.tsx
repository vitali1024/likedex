import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { normalize } from '../library/query';
import { Icon } from './Icon';
import { useFloatingSurface } from './useFloatingSurface';

export interface SelectOption<T extends string> { value: T; label: string }

function SelectMenu<T extends string>({ id, label, options, value, anchor, onChoose, onClose }: {
  id: string; label: string; options: readonly SelectOption<T>[]; value: T; anchor: RefObject<HTMLButtonElement | null>;
  onChoose: (value: T) => void; onClose: (restoreFocus: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(Math.max(0, options.findIndex((option) => option.value === value)));
  const typed = useRef({ text: '', at: 0 });
  useFloatingSurface(anchor, menu, 240);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [anchor, onClose]);
  useEffect(() => { menu.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  return <div ref={menu} id={id} popover="manual" className="single-select-menu floating-surface" role="listbox" aria-label={label}
    tabIndex={-1} data-initial-focus aria-activedescendant={`${id}-${active}`} onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== anchor.current) onClose(false);
    }} onKeyDown={(event) => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); setActive((prior) => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
          : Math.max(0, Math.min(options.length - 1, prior + (event.key === 'ArrowDown' ? 1 : -1))));
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); if (options[active]) onChoose(options[active].value);
      } else if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); onClose(true);
      } else if (event.key === 'Tab') {
        // Restore the origin before native Tab navigation; no trap or preventDefault.
        anchor.current?.focus(); onClose(false);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        const now = Date.now(), previous = now - typed.current.at < 700 ? typed.current.text : '';
        const text = normalize(previous + event.key); typed.current = { text, at: now };
        const found = options.findIndex((option) => normalize(option.label).startsWith(text));
        if (found >= 0) setActive(found);
      }
    }}>
    {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value}
      className="single-select-option" data-active={index === active} data-value={option.value}
      onClick={() => onChoose(option.value)}><span>{option.label}</span>{option.value === value && <Icon name="check" />}</div>)}
  </div>;
}

export function SingleSelect<T extends string>({ label, options, value, onChange, open, onOpenChange, disabled = false, prefix = '' }: {
  label: string; options: readonly SelectOption<T>[]; value: T; onChange: (value: T) => void;
  open: boolean; onOpenChange: (open: boolean) => void; disabled?: boolean; prefix?: string;
}) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const close = (restore: boolean) => { onOpenChange(false); if (restore) anchor.current?.focus({ preventScroll: true }); };
  return <div className="single-select">
    <button ref={anchor} type="button" className="single-select-trigger" aria-label={label} aria-describedby={`${id}-value`}
      aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={open && !disabled ? `${id}-menu` : undefined} disabled={disabled}
      onClick={() => onOpenChange(!open)} onKeyDown={(event) => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); onOpenChange(true); }
      }}><span id={`${id}-value`}>{prefix}{options.find((option) => option.value === value)?.label}</span><Icon name="down" className="control-chevron" /></button>
    {open && !disabled && <SelectMenu id={`${id}-menu`} label={label} options={options} value={value} anchor={anchor}
      onClose={close} onChoose={(next) => { onChange(next); close(true); }} />}
  </div>;
}
