import { useEffect, useState } from 'react';

/** Below this width the app shows a single column; at or above it, both panes. */
export const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

/**
 * True when the viewport is narrower than 768px.
 *
 * Layout switches on this; it says nothing about whether the device supports
 * touch, so never use it to gate touch interactions.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_MEDIA_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);

    // Resync in case the viewport changed between render and effect.
    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
