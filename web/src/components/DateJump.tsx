import { useEffect, useRef, useState } from 'react';
import type { ChatMeta } from '@/types';
import { loadChunk } from '@/data';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface DateJumpProps {
  meta: ChatMeta;
  username: string;
  onClose: () => void;
  onJump: (msgId: number) => void;
}

export function DateJump({ meta, username, onClose, onJump }: DateJumpProps) {
  const minDate = meta.first_date ? new Date(meta.first_date * 1000).toISOString().split('T')[0] : '';
  const maxDate = meta.last_date ? new Date(meta.last_date * 1000).toISOString().split('T')[0] : '';
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Opened from a header button rather than a Radix Trigger, so remember what
  // was focused and hand it back when the dialog closes.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      restoreFocusRef.current = active;
    }
    return () => { aliveRef.current = false; };
  }, []);

  const handleJump = async () => {
    if (!date || busy) return;
    if (meta.chunks.length === 0) {
      setError('该群聊没有可跳转的消息');
      return;
    }

    setBusy(true);
    setError(null);

    const targetStart = new Date(date).getTime() / 1000;
    const targetEnd = targetStart + 86400;

    // Binary search for the chunk containing this date.
    let lo = 0;
    let hi = meta.chunks.length - 1;
    let best = meta.chunks[meta.chunks.length - 1];

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const c = meta.chunks[mid];
      if (c.last_date >= targetStart) {
        // Check if this is better than previous
        if (c.first_date <= targetEnd) {
          // Check previous chunk too
          if (mid > 0) {
            const prev = meta.chunks[mid - 1];
            if (Math.abs(prev.last_date - targetStart) < Math.abs(c.first_date - targetEnd)) {
              best = prev;
            } else {
              best = c;
            }
          } else {
            best = c;
          }
          break;
        }
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    try {
      const msgs = await loadChunk(username, best.file);
      // The dialog may have been closed while the chunk was loading.
      if (!aliveRef.current) return;
      const inRange = msgs.filter((m) => m.d >= targetStart && m.d < targetEnd);
      const target = inRange[0] || msgs.find((m) => m.d >= targetStart) || msgs[msgs.length - 1];
      if (target) {
        onJump(target.i);
      } else {
        setError('这个日期没有找到消息');
      }
    } catch {
      if (aliveRef.current) setError('加载失败，请重试');
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          const target = restoreFocusRef.current;
          if (target && document.contains(target)) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        className="max-w-sm p-4"
        style={{ paddingBottom: 'calc(1rem + var(--app-safe-bottom))' }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">跳转到日期</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="date-jump-input" className="block text-xs text-muted-foreground">
            选择日期
          </label>
          <Input
            id="date-jump-input"
            type="date"
            min={minDate}
            max={maxDate}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setError(null);
            }}
            className="min-w-0"
          />
        </div>

        {error && (
          <p className="text-xs text-destructive" role="alert">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="mobile-touch-target inline-flex items-center justify-center rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleJump}
            disabled={!date || busy}
            className="mobile-touch-target inline-flex items-center justify-center rounded-lg bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {busy ? '跳转中…' : error ? '重试' : '跳转'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
