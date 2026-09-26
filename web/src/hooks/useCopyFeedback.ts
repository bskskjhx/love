import { useCallback, useEffect, useRef, useState } from 'react';
import { copyToClipboard, vibrate } from '@/utils';

/**
 * Copy-to-clipboard with a transient confirmation flag.
 *
 * `copy(label, text)` writes `text` to the clipboard, ticks the device, and
 * reports `label` as copied for `holdMs` — long enough to read, short enough
 * not to trail an overlay's exit. A second copy within the window restarts the
 * countdown instead of stacking timers.
 *
 * `label` is what the caller wants to key its confirmation on: a `boolean` for
 * a single copy button, a string when one panel offers several.
 */
export function useCopyFeedback<T>(holdMs: number) {
  const [copied, setCopied] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback((label: T, text: string) => {
    copyToClipboard(text);
    vibrate(10);
    setCopied(label);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), holdMs);
  }, [holdMs]);

  return [copied, copy] as const;
}
