import { useLayoutEffect, type RefObject } from 'react';

// Native manual popovers enter the top layer without portals, clipping or reflow.
// Size depends on the anchor/viewport, never on draft values or search results.
export function useFloatingSurface(anchor: RefObject<HTMLElement | null>, surface: RefObject<HTMLElement | null>, width: number, height?: number) {
  useLayoutEffect(() => {
    const trigger = anchor.current, popup = surface.current;
    if (!trigger || !popup) return;
    const place = () => {
      const bounds = trigger.getBoundingClientRect();
      const popupWidth = Math.min(Math.max(width, height === undefined ? bounds.width : 0), window.innerWidth - 16);
      const below = Math.max(0, window.innerHeight - bounds.bottom - 16), above = Math.max(0, bounds.top - 16);
      const wanted = height ?? 300;
      const down = below >= wanted || below >= above;
      const available = down ? below : above;
      popup.style.width = `${popupWidth}px`;
      popup.style.maxHeight = `${available}px`;
      if (height !== undefined) popup.style.height = `${Math.min(height, available)}px`;
      const popupHeight = popup.getBoundingClientRect().height;
      popup.style.left = `${Math.max(8, Math.min(bounds.right - popupWidth, window.innerWidth - popupWidth - 8))}px`;
      popup.style.top = `${down ? bounds.bottom + 8 : Math.max(8, bounds.top - popupHeight - 8)}px`;
    };
    popup.showPopover(); place();
    const initialFocus = popup.matches('[data-initial-focus]') ? popup : popup.querySelector<HTMLElement>('[data-initial-focus]');
    initialFocus?.focus({ preventScroll: true });
    const resize = new ResizeObserver(place); resize.observe(trigger);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => {
      resize.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      if (popup.matches(':popover-open')) popup.hidePopover();
    };
  }, [anchor, surface, width, height]);
}
