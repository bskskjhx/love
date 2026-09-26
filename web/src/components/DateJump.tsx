import { useEffect, useRef, useState } from 'react';
import type { ChatMeta } from '@/types';
import { loadChunk } from '@/data';
import { useRestoreFocus } from '@/hooks/useRestoreFocus';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';
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
  const onCloseAutoFocus = useRestoreFocus();
  useBackButtonClose(true, onClose);

  useEffect(() => () => { aliveRef.current = false; }, []);

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

    // Lowest chunk whose range ends on or after the target day — that is the
    // first chunk that can contain it. When the day falls in a gap between
    // chunks, whichever of the two neighbouring boundary dates sits closer wins.
    let lo = 0;
    let hi = meta.chunks.length - 1;
    let idx = hi;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (meta.chunks[mid].last_date >= targetStart) {
        idx = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    const next = meta.chunks[idx];
    const prev = idx > 0 ? meta.chunks[idx - 1] : null;
    const best = prev && Math.abs(prev.last_date - targetStart) < Math.abs(next.first_date - targetEnd)
      ? prev
      : next;

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
        onCloseAutoFocus={onCloseAutoFocus}
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
            className="mobile-touch-target inline-flex items-center justify-center rounded-lg px-3 text-sm text-muted-foreground transition hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleJump}
            disabled={!date || busy}
            className="mobile-touch-target inline-flex items-center justify-center rounded-lg bg-primary px-3 text-sm text-primary-foreground transition hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {busy ? '跳转中…' : error ? '重试' : '跳转'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
