import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import type { LightboxItem } from '@/types';
import { ZoomableImage } from '@/components/ZoomableImage';

interface MediaLightboxProps {
  items: LightboxItem[];
  start: number;
  onClose: () => void;
  username?: string;
}

export function MediaLightbox({ items, start, onClose, username }: MediaLightboxProps) {
  const [index, setIndex] = useState(() =>
    items.length === 0 ? 0 : Math.min(Math.max(start, 0), items.length - 1)
  );
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Keep the index valid if the array is swapped underneath us.
  useEffect(() => {
    setIndex((i) => (items.length === 0 ? 0 : Math.min(Math.max(i, 0), items.length - 1)));
  }, [items]);

  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      restoreFocusRef.current = active;
    }
  }, []);

  const prev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : i)), []);
  const next = useCallback(
    // Length is a dependency so a grown array is not capped by a stale value.
    () => setIndex((i) => (i < items.length - 1 ? i + 1 : i)),
    [items.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next]);

  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const showNav = items.length > 1;

  if (!item) return null;

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        {/* Above the app shell so no ancestor transform or overflow can clip it. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[var(--app-z-media-overlay)] bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            const target = restoreFocusRef.current;
            if (target && document.contains(target)) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
          // Only a click on the empty surface closes; media and controls are
          // separate elements, so their events never reach this test.
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-[var(--app-z-media)] flex flex-col items-center justify-center outline-none"
          style={{
            paddingTop: 'calc(var(--app-safe-top) + 3.5rem)',
            paddingRight: 'calc(var(--app-safe-right) + 3.5rem)',
            paddingBottom: 'calc(var(--app-safe-bottom) + 0.5rem)',
            paddingLeft: 'calc(var(--app-safe-left) + 3.5rem)',
          }}
        >
          <DialogPrimitive.Title className="sr-only">媒体查看</DialogPrimitive.Title>

          {showNav && (
            <span
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm text-white/70"
              style={{ top: 'calc(var(--app-safe-top) + 1rem)' }}
            >
              {index + 1} / {items.length}
            </span>
          )}

          {item.type === 'image' && (
            <ZoomableImage
              key={item.src}
              src={item.src}
              onSwipeLeft={next}
              onSwipeRight={prev}
            />
          )}
          {item.type === 'video' && (
            <VideoView key={item.src} item={item} username={username} />
          )}

          {showNav && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); prev(); }}
                disabled={!hasPrev}
                aria-label="上一张"
                className="mobile-touch-target absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30 disabled:hover:bg-white/10"
                style={{ left: 'calc(var(--app-safe-left) + 0.5rem)' }}
              >
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); next(); }}
                disabled={!hasNext}
                aria-label="下一张"
                className="mobile-touch-target absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30 disabled:hover:bg-white/10"
                style={{ right: 'calc(var(--app-safe-right) + 0.5rem)' }}
              >
                <ChevronRight size={24} aria-hidden="true" />
              </button>
            </>
          )}

          <DialogPrimitive.Close
            aria-label="关闭"
            className="mobile-touch-target absolute flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{
              top: 'calc(var(--app-safe-top) + 0.5rem)',
              right: 'calc(var(--app-safe-right) + 0.5rem)',
            }}
          >
            <X size={24} aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function VideoView({ item, username }: { item: LightboxItem; username?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  // Switching items or closing must not leave the old clip playing.
  useEffect(() => () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }, []);

  if (failed) {
    return (
      <div className="flex max-w-full flex-col items-center gap-3 px-4 text-center text-white">
        <p>暂无完整视频</p>
        {username && item.msgId && (
          <a
            href={`https://t.me/${username}/${item.msgId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mobile-touch-target flex items-center gap-1 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ExternalLink size={14} aria-hidden="true" /> 在 Telegram 中打开
          </a>
        )}
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={item.src}
      poster={item.poster}
      controls
      autoPlay
      playsInline
      className="max-h-full max-w-full"
      onError={() => setFailed(true)}
    />
  );
}
