import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

// Native disclosures retain keyboard activation; dismissal restores the trigger.
export function Disclosure({ label, children, className = '', active = false, ariaLabel, description, describedBy, iconOnly = false, title }: {
  label: ReactNode; children: ReactNode; className?: string; active?: boolean; ariaLabel?: string; description?: string; describedBy?: string | undefined;
  iconOnly?: boolean; title?: string | undefined;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const descriptionId = useId();
  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      const node = ref.current;
      if (!node?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        event.stopPropagation(); node.open = false; node.querySelector('summary')?.focus();
      } else if (event.target instanceof Node && !node.contains(event.target)) node.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); };
  }, []);
  return <details ref={ref} className={`disclosure ${className}`} data-active={active || undefined}>
    <summary className={iconOnly ? 'icon-button' : undefined} title={title} aria-label={ariaLabel} aria-describedby={description ? descriptionId : describedBy}>{label}{!iconOnly && <Icon name="down" />}
      {description && <span className="sr-only" id={descriptionId}>{description}</span>}</summary><div className="disclosure-content">{children}</div>
  </details>;
}
