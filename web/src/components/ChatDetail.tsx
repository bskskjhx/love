import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ArrowLeft, Search, Calendar, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import type { ChatMeta, Message, LightboxItem, AlbumItem, AvatarIndex } from '@/types';
import {
  loadMeta, refreshMeta, loadChunk, refreshChunk, loadAvatarIndex,
} from '@/data';
import {
  fmtDate, preview, buildUserAvatarUrl, prefersReducedMotion,
} from '@/utils';
import { Avatar } from '@/components/Avatar';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { MessageItem, buildAlbumGroups } from '@/components/MessageItem';
import { MediaLightbox } from '@/components/MediaLightbox';
import { UserProfilePopup } from '@/components/UserProfilePopup';
import { ActionMenu } from '@/components/ActionMenu';
import { SearchPanel } from '@/components/SearchPanel';
import { DateJump } from '@/components/DateJump';
import { Button } from '@/components/ui/button';

interface ChatDetailProps {
  username: string;
  initialMsgId?: number;
  onBack: () => void;
}

interface ViewState {
  first: number;
  last: number;
  messages: Message[];
}

/** Pull travel needed before a release refreshes the newest chunk. */
const PULL_THRESHOLD = 56;
const PULL_MAX = 70;

export function ChatDetail({ username, initialMsgId, onBack }: ChatDetailProps) {
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [actionMenu, setActionMenu] = useState<Message | null>(null);
  const [profileUser, setProfileUser] = useState<string | number | null>(null);
  const [avatarIdx, setAvatarIdx] = useState<AvatarIndex>({});
  const [chatAvatar, setChatAvatar] = useState<string | undefined>();
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [showBackToBottom, setShowBackToBottom] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const genRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Map<number, HTMLElement>>(new Map());
  const metaRef = useRef<ChatMeta | null>(null);
  const viewRef = useRef<ViewState | null>(null);
  /** Mirrors `busy` so the chunk loaders can keep a stable identity. */
  const busyRef = useRef(false);

  metaRef.current = meta;
  viewRef.current = view;
  busyRef.current = busy;

  const messagesById = useMemo(() => {
    const m = new Map<number, Message>();
    if (view) for (const msg of view.messages) m.set(msg.i, msg);
    return m;
  }, [view]);

  const albumGroups = useMemo(() => {
    if (!view) return new Map<number, AlbumItem[]>();
    return buildAlbumGroups(view.messages, username);
  }, [view, username]);

  const userAvatarUrl = useCallback((uid: string) => {
    const ts = avatarIdx.ok?.[uid];
    return ts ? buildUserAvatarUrl(username, uid, ts) : undefined;
  }, [avatarIdx, username]);

  const scrollToMsg = useCallback((msgId: number, highlight?: boolean) => {
    const el = msgRefs.current.get(msgId);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    if (!highlight) return;
    setHighlightId(msgId);
    setTimeout(() => setHighlightId(null), 2200);
  }, []);

  // Load meta and the chunk the deep link points at (or the newest one).
  useEffect(() => {
    const gen = ++genRef.current;
    const isCurrent = () => gen === genRef.current;

    setLoading(true);
    setError(null);
    setView(null);
    setMeta(null);
    setAvatarIdx({});
    setChatAvatar(undefined);

    const fail = () => {
      if (!isCurrent()) return;
      setError('加载失败');
      setLoading(false);
    };

    (async () => {
      try {
        const m = await loadMeta(username);
        if (!isCurrent()) return;
        setMeta(m);

        let target = m.chunks[m.chunks.length - 1];
        if (initialMsgId) {
          target = m.chunks.find((c) => c.first_id <= initialMsgId && c.last_id >= initialMsgId) || target;
        }
        const idx = m.chunks.indexOf(target);

        const msgs = await loadChunk(username, target.file);
        if (!isCurrent()) return;
        setView({ first: idx, last: idx, messages: msgs });
        setLoading(false);

        // Let the first paint commit before measuring scroll offsets.
        setTimeout(() => {
          if (initialMsgId) {
            scrollToMsg(initialMsgId, true);
          } else {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }
        }, initialMsgId ? 100 : 50);
      } catch {
        fail();
      }
    })();

    loadAvatarIndex(username).then((idx) => {
      if (!isCurrent()) return;
      setAvatarIdx(idx);
      if (idx.chat?.ok) setChatAvatar(`./data/${username}/avatars/chat.jpg?t=${idx.chat.ts}`);
    });

    return () => { genRef.current += 1; };
  }, [username, initialMsgId, scrollToMsg]);

  /**
   * Loads one chunk under the shared busy/generation guards: late responses
   * from a superseded load never reach `apply`, and `busy` always clears.
   * `bump` is for loads that replace the view (a jump); appending loads keep
   * the current generation so an in-flight neighbour load is not orphaned.
   */
  const withChunk = useCallback(async (
    chunkFile: string,
    bump: boolean,
    apply: (msgs: Message[]) => void,
  ) => {
    const gen = bump ? ++genRef.current : genRef.current;
    setBusy(true);
    try {
      const msgs = await loadChunk(username, chunkFile);
      if (gen !== genRef.current) return;
      apply(msgs);
    } catch {
      // A failed chunk leaves the view as it was.
    } finally {
      if (gen === genRef.current) setBusy(false);
    }
  }, [username]);

  // Jump to a message, loading its chunk first if it is not in view.
  const jumpTo = useCallback(async (msgId: number) => {
    const m = metaRef.current;
    if (!m) return;
    if (viewRef.current?.messages.some((msg) => msg.i === msgId)) {
      scrollToMsg(msgId, true);
      return;
    }
    const chunk = m.chunks.find((c) => c.first_id <= msgId && c.last_id >= msgId);
    if (!chunk) return;
    const idx = m.chunks.indexOf(chunk);
    await withChunk(chunk.file, true, (msgs) => {
      setView({ first: idx, last: idx, messages: msgs });
      setTimeout(() => scrollToMsg(msgId, true), 100);
    });
  }, [scrollToMsg, withChunk]);

  const loadOlder = useCallback(async () => {
    const m = metaRef.current;
    const v = viewRef.current;
    if (!m || !v || v.first <= 0 || busyRef.current) return;
    const el = scrollRef.current;
    const prevScroll = el?.scrollTop || 0;
    const prevHeight = el?.scrollHeight || 0;
    await withChunk(m.chunks[v.first - 1].file, false, (msgs) => {
      setView({ first: v.first - 1, last: v.last, messages: [...msgs, ...v.messages] });
      // Hold the reading position across the prepend.
      requestAnimationFrame(() => {
        const node = scrollRef.current;
        if (node) node.scrollTop = prevScroll + (node.scrollHeight - prevHeight);
      });
    });
  }, [withChunk]);

  const loadNewer = useCallback(async () => {
    const m = metaRef.current;
    const v = viewRef.current;
    if (!m || !v || v.last >= m.chunks.length - 1 || busyRef.current) return;
    await withChunk(m.chunks[v.last + 1].file, false, (msgs) => {
      setView({ first: v.first, last: v.last + 1, messages: [...v.messages, ...msgs] });
    });
  }, [withChunk]);

  // Intersection observers for lazy loading. The loaders keep a stable
  // identity, so the observers survive every busy/render change.
  useEffect(() => {
    const topObs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadOlder(); },
      { root: scrollRef.current, rootMargin: '400px 0px 0px 0px' }
    );
    const botObs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadNewer(); },
      { root: scrollRef.current, rootMargin: '0px 0px 400px 0px' }
    );
    if (topSentinel.current) topObs.observe(topSentinel.current);
    if (bottomSentinel.current) botObs.observe(bottomSentinel.current);
    return () => { topObs.disconnect(); botObs.disconnect(); };
  }, [loadOlder, loadNewer]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight * 1.5;
    const hasNewer = !!meta && !!view && view.last < meta.chunks.length - 1;
    setShowBackToBottom(!nearBottom || hasNewer);
  };

  const scrollToBottom = async () => {
    const m = metaRef.current;
    const v = viewRef.current;
    if (!m || !v) return;
    if (v.last < m.chunks.length - 1) {
      const last = m.chunks.length - 1;
      await withChunk(m.chunks[last].file, true, (msgs) => {
        setView({ first: v.first, last, messages: [...v.messages, ...msgs] });
      });
    }
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
  };

  // Pull-to-refresh: refetch meta, then pull in whatever chunks are new.
  const onRefresh = useCallback(async () => {
    const v = viewRef.current;
    if (!v) return;
    const newMeta = await refreshMeta(username);
    const oldChunks = metaRef.current?.chunks.length || 0;
    const newChunks = newMeta.chunks.length;

    if (newChunks > oldChunks) {
      const added = newMeta.chunks.slice(oldChunks);
      const batches = await Promise.all(added.map((c) => refreshChunk(username, c.file)));
      setMeta(newMeta);
      setView({ first: v.first, last: newChunks - 1, messages: [...v.messages, ...batches.flat()] });
      return;
    }

    if (v.last === newChunks - 1) {
      const msgs = await refreshChunk(username, newMeta.chunks[newChunks - 1].file);
      const existing = new Set(v.messages.map((x) => x.i));
      const fresh = msgs.filter((x) => !existing.has(x.i));
      if (fresh.length > 0) setView({ first: v.first, last: v.last, messages: [...v.messages, ...fresh] });
    }
  }, [username]);

  const { distance: pullDist, refreshing, handlers: pullHandlers } = usePullToRefresh({
    scrollRef,
    threshold: PULL_THRESHOLD,
    max: PULL_MAX,
    // Only the newest chunk can gain messages.
    canStart: () => {
      const v = viewRef.current;
      const m = metaRef.current;
      return !!v && !!m && v.last === m.chunks.length - 1;
    },
    onRefresh,
  });

  const pinnedPreview = useMemo(() => {
    if (!meta?.pinned_id) return null;
    const pinned = view?.messages.find((m) => m.i === meta.pinned_id);
    return pinned ? preview(pinned) : '置顶消息';
  }, [meta, view]);

  useEffect(() => {
    const title = meta ? (meta as unknown as { title?: string }).title || username : username;
    document.title = `${title} - Telegram 聊天存档`;
  }, [username, meta]);

  const openProfile = useCallback((userId: string | number) => {
    if (userId !== '') setProfileUser(userId);
  }, []);

  const openLightbox = useCallback((items: LightboxItem[], index: number) => {
    setLightbox({ items, index });
  }, []);

  const isNarrow = useIsMobile();

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2 shadow-sm">
        {isNarrow && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="返回群聊列表"
            className="mobile-touch-target shrink-0 rounded-full"
          >
            <ArrowLeft size={20} />
          </Button>
        )}
        <Avatar src={chatAvatar} name={username} seed={username} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{username}</p>
          <p className="truncate text-xs text-muted-foreground">
            {meta ? `${meta.first_date ? fmtDate(meta.first_date) : ''} - ${fmtDate(meta.last_date)}` : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSearchOpen(true)}
          aria-label="搜索消息"
          className="mobile-touch-target shrink-0 rounded-full"
        >
          <Search size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDateOpen(true)}
          aria-label="跳转到日期"
          className="mobile-touch-target shrink-0 rounded-full"
        >
          <Calendar size={18} />
        </Button>
      </div>

      {/* Pinned message bar */}
      {meta?.pinned_id && (
        <button
          type="button"
          onClick={() => jumpTo(meta.pinned_id!)}
          aria-label="跳转到置顶消息"
          className="mobile-touch-target flex shrink-0 items-center gap-2 border-b border-border bg-yellow-50 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-yellow-100 active:bg-yellow-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="shrink-0 text-yellow-600" aria-hidden="true">📌</span>
          <span className="min-w-0 truncate">{pinnedPreview}</span>
        </button>
      )}

      {/* Pull refresh indicator */}
      <div className="flex shrink-0 justify-center overflow-hidden" style={{ height: pullDist }}>
        <RefreshCw size={18} className={`mt-1 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
      </div>

      {/* Messages — the only scrolling region of the detail pane */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-14"
        onScroll={onScroll}
        {...pullHandlers}
      >
        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 size={20} className="mr-2 animate-spin" aria-hidden="true" /> 加载中…
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mobile-touch-target mt-2 inline-flex items-center justify-center px-3 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && view && (
          <>
            {/* Top sentinel + load older */}
            <div ref={topSentinel} className="h-1" />
            {view.first > 0 && (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={busy}
                  className="mobile-touch-target inline-flex items-center justify-center px-3 text-xs text-primary transition-opacity active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {busy ? '加载中…' : '加载更早消息'}
                </button>
              </div>
            )}
            {view.first <= 0 && view.messages.length > 0 && (
              <div className="flex justify-center py-2 text-xs text-muted-foreground">已到最早消息</div>
            )}

            {view.messages.map((msg, idx) => {
              const uid = msg.u !== undefined ? String(msg.u) : (msg.n || '');
              return (
                <div key={msg.i} ref={(el) => { if (el) msgRefs.current.set(msg.i, el); }}>
                  <MessageItem
                    msg={msg}
                    prev={view.messages[idx - 1]}
                    next={view.messages[idx + 1]}
                    username={username}
                    chatAvatar={chatAvatar}
                    chatTitle={username}
                    onOpenLightbox={openLightbox}
                    onJumpTo={jumpTo}
                    onOpenProfile={openProfile}
                    onActionMenu={setActionMenu}
                    messagesById={messagesById}
                    highlight={highlightId === msg.i}
                    albumItems={albumGroups.get(msg.i)}
                    avatarUrl={userAvatarUrl(uid)}
                  />
                </div>
              );
            })}

            {view.last < (meta?.chunks.length || 0) - 1 && (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  onClick={loadNewer}
                  disabled={busy}
                  className="mobile-touch-target inline-flex items-center justify-center px-3 text-xs text-primary transition-opacity active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {busy ? '加载中…' : '加载更新消息'}
                </button>
              </div>
            )}
            <div ref={bottomSentinel} className="h-1" />
          </>
        )}
      </div>

      {/* Back to bottom button — positioned against the detail pane, not the viewport */}
      {showBackToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="回到最新消息"
          className="mobile-touch-target absolute bottom-4 right-4 z-[var(--app-z-floating)] flex items-center justify-center rounded-full bg-card shadow-lg transition hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronUp size={20} className="text-muted-foreground" aria-hidden="true" />
        </button>
      )}

      {/* Search panel */}
      {searchOpen && (
        <SearchPanel
          username={username}
          meta={meta}
          onClose={() => setSearchOpen(false)}
          onJumpTo={(id) => { jumpTo(id); setSearchOpen(false); }}
        />
      )}

      {/* Date jump */}
      {dateOpen && meta && (
        <DateJump
          meta={meta}
          username={username}
          onClose={() => setDateOpen(false)}
          onJump={(id) => { jumpTo(id); setDateOpen(false); }}
        />
      )}

      {/* Lightbox */}
      {lightbox && (
        <MediaLightbox
          items={lightbox.items}
          start={lightbox.index}
          onClose={() => setLightbox(null)}
          username={username}
        />
      )}

      {/* Action menu */}
      {actionMenu && (
        <ActionMenu
          msg={actionMenu}
          username={username}
          onClose={() => setActionMenu(null)}
          onJumpTo={jumpTo}
        />
      )}

      {/* User profile */}
      {profileUser !== null && (
        <UserProfilePopup
          username={username}
          userId={profileUser}
          onClose={() => setProfileUser(null)}
          avatarUrl={userAvatarUrl(String(profileUser))}
        />
      )}
    </div>
  );
}
