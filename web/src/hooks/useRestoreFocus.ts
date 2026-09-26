import { useCallback, useRef } from 'react';

/**
 * Hands focus back to whatever was focused when an overlay opened.
 *
 * These overlays are opened from a header button or a long press, so Radix has
 * no `Trigger` to restore focus to and would otherwise drop focus on `<body>`.
 *
 * The element is captured during the first render rather than in an effect.
 * Effects run child-first, so an overlay that focuses something of its own on
 * open (SearchPanel puts the caret in its field) has already moved focus by the
 * time a parent effect could look — and the effect would then "restore" focus to
 * an element inside the overlay being closed.
 *
 * Returns a handler for `onCloseAutoFocus`. It is a no-op when the remembered
 * element has since left the document.
 */
export function useRestoreFocus(): (event: Event) => void {
  const restoreRef = useRef<HTMLElement | null>(null);

  if (restoreRef.current === null) {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      restoreRef.current = active;
    }
  }

  return useCallback((event: Event) => {
    const target = restoreRef.current;
    if (!target || !document.contains(target)) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  }, []);
}
