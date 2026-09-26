import { RefreshCw } from 'lucide-react';
import { prefersReducedMotion } from '@/utils';
import { PULL_SETTLE_EASING, PULL_SETTLE_MS } from '@/hooks/usePullToRefresh';

interface PullIndicatorProps {
  /** Spacer height, i.e. how far the content has been pushed down. */
  offset: number;
  /** 0..1 of the way to the release threshold. */
  progress: number;
  refreshing: boolean;
  /** True while a finger is driving the gesture. */
  pulling: boolean;
}

const ICON_PX = 22;

/**
 * The refresh spinner for `usePullToRefresh`.
 *
 * Rendered as the first child of the scroll container and pinned with
 * `position: sticky` at zero height, so it stays fixed to the scrollport while
 * the content slides down *past* it — the spinner is revealed in the gap the
 * spacer opens rather than being carried down the screen with the list, which is
 * what a native refresh control does. Taking no flow height is what keeps it out
 * of the list's layout entirely.
 *
 * `pointer-events-none` throughout: it overlays the top rows and must never
 * intercept a touch meant for them.
 */
export function PullIndicator({ offset, progress, refreshing, pulling }: PullIndicatorProps) {
  const reduced = prefersReducedMotion();

  return (
    <div
      className="pointer-events-none sticky top-0 z-[var(--app-z-header)] h-0 text-center"
      style={{
        opacity: Math.min(1, progress * 1.5),
        transition: 'opacity 200ms linear',
      }}
    >
      <div
        className="inline-block"
        style={{
          // Centred in the gap the spacer has opened, so the spinner tracks the
          // pull instead of sitting pinned to the top edge.
          transform: `translateY(${offset / 2 - ICON_PX / 2}px)`,
          transition: pulling ? 'none' : `transform ${PULL_SETTLE_MS}ms ${PULL_SETTLE_EASING}`,
        }}
      >
        <RefreshCw
          size={ICON_PX}
          aria-hidden="true"
          className={`text-muted-foreground ${
            refreshing ? (reduced ? 'animate-pulse' : 'animate-spin') : ''
          }`}
          style={
            // Rotation is the live feedback that the pull is registering, so it is
            // dropped entirely under reduced motion rather than merely slowed.
            refreshing || reduced ? undefined : { transform: `rotate(${Math.round(progress * 180)}deg)` }
          }
        />
      </div>
      <span className="sr-only" role="status">
        {refreshing ? '正在刷新' : ''}
      </span>
    </div>
  );
}
