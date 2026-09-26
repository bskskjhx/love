import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { fmtDur } from '@/utils';
import { Slider } from '@/components/ui/slider';

interface VoicePlayerProps {
  src: string;
  dur?: number;
}

export function VoicePlayer({ src, dur }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(dur || 0);
  const [failed, setFailed] = useState(false);
  /** The browser refused to start playback (autoplay policy) — retryable. */
  const [blocked, setBlocked] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  /** Mirrors `dragging` for use inside the audio event closure. */
  const draggingRef = useRef(false);
  /** Guards async play() results against a source change or unmount. */
  const srcRef = useRef(src);
  srcRef.current = src;

  // A new source is a new clip: drop every bit of state from the old one.
  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(dur || 0);
    setFailed(false);
    setBlocked(false);
    setDragging(null);
    draggingRef.current = false;
  }, [src, dur]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onTime = () => {
      if (!draggingRef.current) setCurrent(audio.currentTime);
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onErr = () => {
      setFailed(true);
      setPlaying(false);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onErr);
    return () => {
      // Never leave a ghost clip playing behind a swapped src or an unmount.
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onErr);
    };
  }, [src]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || failed) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    const requestedSrc = src;
    try {
      await audio.play();
      if (srcRef.current !== requestedSrc) return;
      setPlaying(true);
      setBlocked(false);
    } catch (err) {
      if (srcRef.current !== requestedSrc) return;
      setPlaying(false);
      // The autoplay policy refusing is not the same as an undecodable file:
      // leave the button usable instead of declaring the clip broken.
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        setBlocked(true);
      } else {
        setFailed(true);
      }
    }
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio || !duration || !Number.isFinite(time)) return;
    const clamped = Math.max(0, Math.min(duration, time));
    audio.currentTime = clamped;
    setCurrent(clamped);
  };

  const onValueChange = (values: number[]) => {
    const next = values[0];
    if (typeof next !== 'number') return;
    draggingRef.current = true;
    setDragging(next);
    seekTo(next);
  };

  const onValueCommit = (values: number[]) => {
    draggingRef.current = false;
    setDragging(null);
    const next = values[0];
    if (typeof next === 'number') seekTo(next);
  };

  if (failed) {
    return <span className="text-sm text-muted-foreground">语音消息不可用</span>;
  }

  const display = dragging ?? (playing || current > 0 ? current : duration);
  const sliderValue = [dragging ?? Math.min(current, duration || 0)];

  return (
    // Long press must not compete with play/seek on the player surface.
    <div className="flex min-w-0 max-w-full items-center gap-2" data-no-menu>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? '暂停语音' : '播放语音'}
        title={blocked ? '浏览器阻止了自动播放，请再点一次' : undefined}
        className="mobile-touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </button>
      <Slider
        thumbLabel="播放进度"
        value={sliderValue}
        max={duration || 1}
        step={0.1}
        disabled={!duration}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        className="min-w-0 flex-1"
      />
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {fmtDur(display)}
      </span>
    </div>
  );
}
