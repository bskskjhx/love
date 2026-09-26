import { useEffect, useId, useRef } from 'react';
import { release, retain } from '@/lib/overlayHistory';

/**
 * While `enabled` is true, the Android hardware Back button closes this overlay
 * instead of navigating. See `@/lib/overlayHistory` for why the bookkeeping is
 * a set edit plus a coalesced microtask rather than a push/pop pair.
 *
 * `id` comes from `useId`, so every mounted overlay is its own stack entry and
 * nesting resolves last-opened-first. `onClose` is read through a ref: these
 * callers pass a fresh arrow every render, and re-subscribing on each of those
 * would churn the history entry.
 */
export function useBackButtonClose(enabled: boolean, onClose: () => void): void {
  const id = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const close = () => onCloseRef.current();
    retain(id, close);
    return () => release(id);
  }, [enabled, id]);
}
