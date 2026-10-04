import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

// Native disclosures retain keyboard activation; dismissal restores the trigger.
export function Disclosure({ label, children, className = '', active = false }: {
  label: ReactNode; children: ReactNode; className?: string; active?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
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
    <summary>{label}<Icon name="down" /></summary><div className="disclosure-content">{children}</div>
  </details>;
}
