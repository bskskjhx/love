import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/utils';

export interface ZoomableImageProps {
  src: string;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/** Horizontal travel that switches to the neighbouring image at scale 1. */
const SWIPE_PX = 50;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 40;

interface Point { x: number; y: number }

export function ZoomableImage({ src, onSwipeLeft, onSwipeRight }: ZoomableImageProps) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const stateRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef<Map<number, Point>>(new Map());
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const swipeStart = useRef<Point | null>(null);
  const moved = useRef(false);

  const update = useCallback((s: number, x: number, y: number) => {
    stateRef.current = { scale: s, tx: x, ty: y };
    setScale(s);
    setTx(x);
    setTy(y);
  }, []);

  /**
   * Bounds come from the measured media container and the image's layout size,
   * not from the viewport, so a letterboxed image pans correctly.
   */
  const clampPan = useCallback((x: number, y: number, s: number): Point => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const container = img.parentElement;
    const containerW = container?.clientWidth || window.innerWidth;
    const containerH = container?.clientHeight || window.innerHeight;
    const maxX = Math.max(0, (img.offsetWidth * s - containerW) / 2);
    const maxY = Math.max(0, (img.offsetHeight * s - containerH) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  // A different image is a different gesture surface.
  useEffect(() => {
    pointers.current.clear();
    pinchStart.current = null;
    panStart.current = null;
    swipeStart.current = null;
    lastTap.current = null;
    moved.current = false;
    update(1, 0, 0);
  }, [src, update]);

  // Rotation or a viewport change can leave the image panned out of bounds.
  useEffect(() => {
    const onResize = () => {
      const { scale: s, tx: x, ty: y } = stateRef.current;
      const clamped = clampPan(x, y, s);
      update(s, clamped.x, clamped.y);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [clampPan, update]);

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: stateRef.current.scale,
      };
      // A pinch supersedes any single-finger intent.
      panStart.current = null;
      swipeStart.current = null;
    } else if (pointers.current.size === 1) {
      if (stateRef.current.scale > MIN_SCALE) {
        panStart.current = { x: e.clientX, y: e.clientY, tx: stateRef.current.tx, ty: stateRef.current.ty };
      } else {
        swipeStart.current = { x: e.clientX, y: e.clientY };
      }
    }
    moved.current = false;
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = true;

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = dist / pinchStart.current.dist;
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStart.current.scale * ratio));
      const clamped = clampPan(stateRef.current.tx, stateRef.current.ty, next);
      update(next, clamped.x, clamped.y);
      return;
    }

    if (pointers.current.size === 1 && panStart.current && stateRef.current.scale > MIN_SCALE) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      const clamped = clampPan(panStart.current.tx + dx, panStart.current.ty + dy, stateRef.current.scale);
      update(stateRef.current.scale, clamped.x, clamped.y);
    }
  };

  const settle = () => {
    if (stateRef.current.scale < MIN_SCALE + 0.05) {
      update(MIN_SCALE, 0, 0);
      return;
    }
    const clamped = clampPan(stateRef.current.tx, stateRef.current.ty, stateRef.current.scale);
    update(stateRef.current.scale, clamped.x, clamped.y);
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;

    if (pointers.current.size === 0) {
      const start = swipeStart.current;
      const wasSingleFinger = start !== null;
      panStart.current = null;
      swipeStart.current = null;
      settle();

      if (!moved.current) {
        const now = Date.now();
        const last = lastTap.current;
        if (last && now - last.t <= DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= DOUBLE_TAP_SLOP) {
          update(stateRef.current.scale > MIN_SCALE ? MIN_SCALE : DOUBLE_TAP_SCALE, 0, 0);
          lastTap.current = null;
        } else {
          lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        }
      } else if (wasSingleFinger && start && stateRef.current.scale === MIN_SCALE) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) onSwipeRight();
          else onSwipeLeft();
        }
      }
      moved.current = false;
      return;
    }

    if (pointers.current.size === 1) {
      // A pinch just ended with one finger still down. Rebuild single-finger
      // state from that finger so the pre-pinch swipe intent is not reused.
      const remaining = [...pointers.current.values()][0];
      const zoomed = stateRef.current.scale > MIN_SCALE;
      swipeStart.current = zoomed ? null : { x: remaining.x, y: remaining.y };
      panStart.current = zoomed
        ? { x: remaining.x, y: remaining.y, tx: stateRef.current.tx, ty: stateRef.current.ty }
        : null;
      moved.current = true;
    }
  };

  /** Cancelled or lost capture must not be read as a tap or a swipe. */
  const onCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    pinchStart.current = null;
    panStart.current = null;
    swipeStart.current = null;
    moved.current = false;
    settle();
  };

  return (
    <img
      ref={imgRef}
      src={src}
      alt=""
      draggable={false}
      // touch-action is scoped to this surface only.
      className="max-h-full max-w-full select-none touch-none"
      style={{
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        transition: pointers.current.size === 0 && !prefersReducedMotion() ? 'transform 0.2s ease' : 'none',
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onLostPointerCapture={onCancel}
    />
  );
}
