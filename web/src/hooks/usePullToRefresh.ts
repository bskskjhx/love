import { useCallback, useEffect, useRef, useState } from 'react';
import { vibrate } from '@/utils';

/** Travel the indicator rests at while a refresh is in flight. */
const REST_PX = 56;
/** A refresh that resolves instantly still shows the spinner this long. */
const MIN_VISIBLE_MS = 500;
/** Haptic tick when the pull crosses the release threshold. */
const TICK_MS = 8;
/**
 * Fractional overscroll tolerance when deciding "is the list at the top". iOS
 * leaves a fractional (or briefly negative) `scrollTop` after a bounce, so an
 * exact `=== 0` test misses gestures the user clearly means.
 */
const AT_TOP_SLOP = 1;

/**
 * How the list settles back on release. Shared with the indicator so the spacer
 * and the spinner cannot drift apart — they are two halves of one motion.
 */
export const PULL_SETTLE_MS = 320;
export const PULL_SETTLE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

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
  /** Damped travel at which a release refreshes. */
  threshold: number;
  /** Asymptote the damped travel approaches but never reaches. */
  max: number;
}

export interface PullToRefresh {
  /** Spacer height / indicator travel: the damped pull, a resting offset while
      refreshing, 0 at rest. One number so the content and the spinner cannot
      disagree about how far the list has moved. */
  offset: number;
  /** 0..1 of the way to the release threshold. */
  progress: number;
  refreshing: boolean;
  /** True while a finger is driving the gesture. */
  pulling: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
  };
}

/**
 * iOS-style resistance: 1:1 to begin with, then asymptotically stiffening toward
 * `max`. The previous linear damp travelled the same fraction of finger movement
 * at every distance, which is what reads as rubbery rather than weighted — a
 * pull should get harder the further it goes.
 */
function resist(travel: number, max: number): number {
  return max * (1 - Math.exp(-travel / max));
}

/**
 * Pull-to-refresh for a scroll container: arm on a one-finger touch at the very
 * top, damp the travel as the finger moves down, and refresh on release past
 * `threshold`. Pushing up, a second finger, or the list scrolling all cancel the
 * gesture instead of leaving a stuck indicator.
 */
export function usePullToRefresh({ scrollRef, canStart, onRefresh, threshold, max }: Options): PullToRefresh {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [pulling, setPulling] = useState(false);

  const pull = useRef({ pulling: false, startY: 0, dist: 0, armed: false });
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
    pull.current = { pulling: false, startY: 0, dist: 0, armed: false };
    setPulling(false);
    setDistance(0);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (e.touches.length !== 1) {
      cancel();
      return;
    }
    if (!el || refreshingRef.current || el.scrollTop > AT_TOP_SLOP) return;
    if (canStartRef.current && !canStartRef.current()) return;
    pull.current = { pulling: true, startY: e.touches[0].clientY, dist: 0, armed: false };
    setPulling(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!pull.current.pulling) return;
    const el = scrollRef.current;
    const delta = e.touches.length === 1 ? e.touches[0].clientY - pull.current.startY : 0;
    // Pushing up cancels the gesture rather than leaving a stuck indicator.
    if (!el || e.touches.length !== 1 || el.scrollTop > AT_TOP_SLOP || delta <= 0) {
      cancel();
      return;
    }

    const dist = resist(delta, max);
    pull.current.dist = dist;
    setDistance(dist);

    // Tick exactly once per crossing, so dragging back and forth across the
    // threshold does not buzz continuously.
    const armed = dist >= threshold;
    if (armed !== pull.current.armed) {
      pull.current.armed = armed;
      if (armed) vibrate(TICK_MS);
    }
  };

  const onTouchEnd = async () => {
    if (!pull.current.pulling) return;
    const reached = pull.current.dist >= threshold;
    cancel();
    if (!reached) return;

    const startedAt = Date.now();
    refreshingRef.current = true;
    setRefreshing(true);

    try {
      await onRefreshRef.current();
    } catch {
      // A failed refresh leaves the data as it was; the indicator still retracts.
    } finally {
      // Hold only long enough to reach MIN_VISIBLE_MS, so a fast refresh still
      // reads as having happened and a slow one is not padded out further.
      const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        refreshingRef.current = false;
        setRefreshing(false);
      }, remaining);
    }
  };

  // While refreshing, the spacer holds the content down at a fixed offset and the
  // spinner sits in the gap that opens up — the list reveals the spinner instead
  // of pushing it off the top, which is what a native refresh control does.
  const offset = refreshing ? REST_PX : distance;

  return {
    offset,
    progress: Math.min(1, offset / threshold),
    refreshing,
    pulling,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: cancel },
  };
}
