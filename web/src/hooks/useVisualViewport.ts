import { useEffect, useState } from 'react';

export interface VisualViewportState {
  /** Visible height in CSS pixels. */
  height: number;
  /** Offset of the visible area from the top of the layout viewport. */
  offsetTop: number;
}

function readViewport(): VisualViewportState {
  const vv = window.visualViewport;
  if (vv) return { height: vv.height, offsetTop: vv.offsetTop };
  return { height: window.innerHeight, offsetTop: 0 };
}

/**
 * Tracks the visible viewport so an overlay can size itself above the soft
 * keyboard.
 *
 * Pinch-zoom is deliberately ignored: while `scale !== 1` the visible height
 * shrinks with the zoom, and following it would reflow the panel mid-gesture.
 * The next resize once zoom returns to 1 resyncs.
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(readViewport);

  useEffect(() => {
    const vv = window.visualViewport;

    if (!vv) {
      const onResize = () => setState(readViewport());
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    let frame = 0;

    const update = () => {
      frame = 0;
      if (vv.scale !== 1) return;
      setState({ height: vv.height, offsetTop: vv.offsetTop });
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
    };
  }, []);

  return state;
}
