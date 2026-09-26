import { useCallback, useEffect, useRef } from 'react';

/**
 * Hands focus back to whatever was focused when an overlay opened.
 *
 * These overlays are opened from a header button or a long press, so Radix has
 * no `Trigger` to restore focus to and would otherwise drop focus on `<body>`.
 *
 * Returns a handler for `onCloseAutoFocus`. It is a no-op when the remembered
 * element has since left the document.
 */
export function useRestoreFocus(): (event: Event) => void {
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      restoreRef.current = active;
    }
  }, []);

  return useCallback((event: Event) => {
    const target = restoreRef.current;
    if (!target || !document.contains(target)) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
  }, []);
}
