import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the indicator keeps spinning after the refresh resolves. */
const HOLD_MS = 600;
/** Fraction of the finger travel that becomes indicator travel. */
const DAMPING = 0.5;

interface Options {
  /** The scrolling element the gesture is measured against. */
  scrollRef: React.RefObject<HTMLElement>;
  /**
   * Whether a pull may start at all — checked on touch start, so a gesture that
   * begins away from the top, or while the view is pinned away from the newest
   * data, is ignored rather than cancelled mid-gesture.
   */
  canStart?: () => boolean;
  onRefresh: () => Promise<void>;
  /** Travel needed before a release refreshes. */
  threshold: number;
  /** Ceiling for the damped pull distance. */
  max: number;
}

export interface PullToRefresh {
  /** Indicator height in px; 0 when idle. */
  distance: number;
  refreshing: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
  };
}

/**
 * Pull-to-refresh for a scroll container: arm on a one-finger touch at the very
 * top, damp the travel as the finger moves down, and refresh on release past
 * `threshold`. Pushing up, a second finger, or the list scrolling all cancel
 * the gesture instead of leaving a stuck indicator.
 */
export function usePullToRefresh({ scrollRef, canStart, onRefresh, threshold, max }: Options): PullToRefresh {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const pull = useRef({ pulling: false, startY: 0, dist: 0 });
  /** Mirrors `refreshing` so the touch handlers never read stale state. */
  const refreshingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Both callbacks capture live view state, so read them through refs.
  const canStartRef = useRef(canStart);
  const onRefreshRef = useRef(onRefresh);
  canStartRef.current = canStart;
  onRefreshRef.current = onRefresh;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const cancel = useCallback(() => {
    pull.current = { pulling: false, startY: 0, dist: 0 };
    setDistance(0);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (e.touches.length !== 1) {
      cancel();
      return;
    }
    if (!el || refreshingRef.current || el.scrollTop > 0) return;
    if (canStartRef.current && !canStartRef.current()) return;
    pull.current = { pulling: true, startY: e.touches[0].clientY, dist: 0 };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!pull.current.pulling) return;
    const el = scrollRef.current;
    const delta = e.touches.length === 1 ? e.touches[0].clientY - pull.current.startY : 0;
    // Pushing up cancels the gesture rather than leaving a stuck indicator.
    if (!el || e.touches.length !== 1 || el.scrollTop > 0 || delta <= 0) {
      cancel();
      return;
    }
    const damped = Math.min(max, delta * DAMPING);
    pull.current.dist = damped;
    setDistance(damped);
  };

  const onTouchEnd = async () => {
    if (!pull.current.pulling) return;
    const reached = pull.current.dist >= threshold;
    cancel();
    if (!reached) return;

    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await onRefreshRef.current();
    } catch {
      // A failed refresh leaves the data as it was; the indicator still retracts.
    } finally {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        refreshingRef.current = false;
        setRefreshing(false);
      }, HOLD_MS);
    }
  };

  return { distance, refreshing, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: cancel } };
}
