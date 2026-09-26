import { useCallback, useEffect, useRef } from 'react';
import type { Message, LightboxItem, AlbumItem } from '@/types';
import {
  isAnon, senderName, sameSender, sameDay, withinSeconds,
  fmtTimeShort, fmtTimeFull, fmtDate, nameColor, mediaExt, buildMediaUrl,
} from '@/utils';
import { Avatar } from '@/components/Avatar';
import { MessageContent, AlbumContent } from '@/components/MessageContent';

interface MessageItemProps {
  msg: Message;
  prev?: Message;
  next?: Message;
  username: string;
  chatAvatar?: string;
  chatTitle?: string;
  searchTerms?: string[];
  onOpenLightbox: (items: LightboxItem[], index: number) => void;
  onJumpTo: (msgId: number) => void;
  onOpenProfile: (userId: string | number) => void;
  onActionMenu: (msg: Message, x: number, y: number) => void;
  messagesById: Map<number, Message>;
  highlight?: boolean;
  albumItems?: AlbumItem[];
  avatarUrl?: string;
}

/** Long-press duration before the message menu opens. */
const LONG_PRESS_MS = 500;
/** Movement that cancels a long press, in CSS pixels. */
const LONG_PRESS_SLOP = 10;

/**
 * Anything inside a message that owns its own interaction. Long press and tap
 * both ignore these, so links, media and sliders are never swallowed.
 */
const INTERACTIVE_SELECTOR =
  'a, button, img, video, audio, input, textarea, select, [role="slider"], [data-no-menu]';

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}

export function MessageItem({
  msg, prev, next, username, chatAvatar, chatTitle,
  searchTerms, onOpenLightbox, onJumpTo, onOpenProfile, onActionMenu,
  messagesById, highlight, albumItems, avatarUrl,
}: MessageItemProps) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  /** Swallows the click that the browser synthesises after a long press. */
  const suppressClick = useRef(false);

  const isFirst = !prev || !sameSender(prev, msg) || !sameDay(prev.d, msg.d) || !withinSeconds(prev.d, msg.d, 300);
  const isLast = !next || !sameSender(next, msg) || !sameDay(next.d, msg.d) || !withinSeconds(next.d, msg.d, 300);

  const anon = isAnon(msg);
  const displayName = anon ? (chatTitle || username) : senderName(msg);
  const seed = anon ? username : (msg.u !== undefined ? msg.u : msg.n);
  const avatarSrc = anon ? chatAvatar : avatarUrl;

  const showDateSeparator = !prev || !sameDay(prev.d, msg.d);

  const clearPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  }, []);

  // A press that outlives its message must not fire later.
  useEffect(() => clearPress, [clearPress]);

  const onPointerDown = (e: React.PointerEvent) => {
    suppressClick.current = false;
    // Touch only, and only the first finger down.
    if (e.pointerType !== 'touch' || !e.isPrimary) {
      clearPress();
      return;
    }
    if (isInteractiveTarget(e.target)) return;

    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      suppressClick.current = true;
      onActionMenu(msg, e.clientX, e.clientY);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pressStart.current) return;
    const dx = Math.abs(e.clientX - pressStart.current.x);
    const dy = Math.abs(e.clientY - pressStart.current.y);
    if (dx > LONG_PRESS_SLOP || dy > LONG_PRESS_SLOP) clearPress();
  };

  const onPointerUp = () => clearPress();

  const onClick = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (isInteractiveTarget(e.target)) return;
    // Never steal the tap that ends a text selection.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString()) return;
    onActionMenu(msg, e.clientX, e.clientY);
  };

  return (
    <>
      {showDateSeparator && (
        <div className="flex justify-center py-2">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
            {fmtDate(msg.d)}
          </span>
        </div>
      )}
      <div
        data-msg-id={msg.i}
        className={`flex min-w-0 gap-2 px-2 py-0.5 transition-colors ${highlight ? 'bg-yellow-100' : ''} ${isFirst ? 'mt-1' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      >
        {isLast ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenProfile(seed || ''); }}
            aria-label={`查看 ${displayName} 的资料`}
            className="-m-1 shrink-0 self-end rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar src={avatarSrc} name={displayName} seed={seed} size={32} />
          </button>
        ) : (
          /* Keeps the message column aligned with rows that do show an avatar. */
          <div className="w-8 shrink-0 self-end" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {isFirst && (
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenProfile(seed || ''); }}
                aria-label={`查看 ${displayName} 的资料`}
                className="min-w-0 truncate text-left text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ color: nameColor(seed, msg.n) }}
              >
                {displayName}
              </button>
              {anon && (
                <span className="shrink-0 rounded bg-secondary px-1 text-[10px] text-muted-foreground">
                  所有者
                </span>
              )}
            </div>
          )}
          <div className="min-w-0 max-w-full break-words rounded-lg bg-card px-2.5 py-1.5 shadow-sm">
            {albumItems && albumItems.length >= 2 ? (
              <AlbumContent items={albumItems} onOpenLightbox={onOpenLightbox} />
            ) : (
              <MessageContent
                msg={msg}
                username={username}
                searchTerms={searchTerms}
                onOpenLightbox={onOpenLightbox}
                onJumpTo={onJumpTo}
                messagesById={messagesById}
              />
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            {msg.e && <span>已编辑</span>}
            <span className="time-short">{fmtTimeShort(msg.d)}</span>
            <span className="time-full hidden">{fmtTimeFull(msg.d)}</span>
            <span>#{msg.i}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export function useAlbumGroups(messages: Message[], username: string): Map<number, AlbumItem[]> {
  const albumMap = new Map<number, AlbumItem[]>();
  const groups = new Map<string, Message[]>();

  for (const msg of messages) {
    if (!msg.g || !msg.m) continue;
    const arr = groups.get(msg.g) || [];
    arr.push(msg);
    groups.set(msg.g, arr);
  }

  for (const [, msgs] of groups) {
    if (msgs.length < 2) continue;
    const items: AlbumItem[] = msgs.map((m) => {
      const ext = mediaExt(m);
      return {
        id: m.i,
        kind: m.m === 'video' ? 'video' : m.m === 'sticker' ? 'sticker' : 'photo',
        thumbSrc: buildMediaUrl(username, m.i, ext),
        mediaSrc: buildMediaUrl(username, m.i, ext),
        dur: m.dur,
      };
    });
    for (const m of msgs) {
      albumMap.set(m.i, items);
    }
  }
  return albumMap;
}
