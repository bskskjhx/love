import { useEffect, useRef, useState } from 'react';
import { Copy, Link2, ExternalLink, CornerUpLeft, X, type LucideIcon } from 'lucide-react';
import type { Message } from '@/types';
import { copyToClipboard, vibrate, isAnon } from '@/utils';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

interface ActionMenuProps {
  msg: Message;
  username: string;
  onClose: () => void;
  onJumpTo: (msgId: number) => void;
}

export function ActionMenu({ msg, username, onClose, onJumpTo }: ActionMenuProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Opened by a long press, so Radix has no Trigger to hand focus back to.
  // Remember what was focused and restore it on close.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      restoreFocusRef.current = active;
    }
  }, []);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const showCopyLink = !!username;
  const showCopyText = !!msg.t;
  const showTelegram = !isAnon(msg) && !!username;
  const showJumpReply = !!msg.r;

  const baseUrl = window.location.href.split('#')[0];

  const doCopy = (text: string, key: string) => {
    copyToClipboard(text);
    vibrate(10);
    setCopied(key);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 1500);
  };

  const copyLink = () => {
    doCopy(`${baseUrl}#/${username}/${msg.i}`, 'link');
  };

  const copyText = () => {
    doCopy(msg.t || '', 'text');
  };

  const openTelegram = () => {
    window.open(`https://t.me/${username}/${msg.i}`, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const jumpReply = () => {
    if (msg.r) onJumpTo(msg.r);
    onClose();
  };

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          const target = restoreFocusRef.current;
          if (target && document.contains(target)) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        className="mx-auto w-full max-w-sm rounded-t-2xl p-2 sm:rounded-2xl"
        style={{ paddingBottom: 'calc(0.5rem + var(--app-safe-bottom))' }}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>消息操作</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col">
          {showCopyLink && (
            <MenuItem icon={Link2} label="复制消息链接" copied={copied === 'link'} onClick={copyLink} />
          )}
          {showCopyText && (
            <MenuItem icon={Copy} label="复制文字" copied={copied === 'text'} onClick={copyText} />
          )}
          {showTelegram && (
            <MenuItem icon={ExternalLink} label="在 Telegram 中查看" onClick={openTelegram} />
          )}
          {showJumpReply && (
            <MenuItem icon={CornerUpLeft} label="跳转到被回复消息" onClick={jumpReply} />
          )}
        </div>

        {/* The single always-available close entry, since the sheet draws no X. */}
        <div className="mt-1 border-t border-border pt-1">
          <MenuItem icon={X} label="关闭" onClick={onClose} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MenuItem({
  icon: Icon, label, onClick, copied,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  copied?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mobile-touch-target flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <Icon size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 break-words">{copied ? '已复制' : label}</span>
    </button>
  );
}
