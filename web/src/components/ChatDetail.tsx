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
import { MessageItem, useAlbumGroups } from '@/components/MessageItem';
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
  onOpenProfile?: (userId: string | number) => void;
}

interface ViewState {
  first: number;
  last: number;
  messages: Message[];
}

export function ChatDetail({ username, initialMsgId, onBack }: ChatDetailProps) {
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [actionMenu, setActionMenu] = useState<{ msg: Message } | null>(null);
  const [profileUser, setProfileUser] = useState<string | number | null>(null);
  const [avatarIdx, setAvatarIdx] = useState<AvatarIndex>({});
  const [chatAvatar, setChatAvatar] = useState<string | undefined>();
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [showBackToBottom, setShowBackToBottom] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [pinnedPreview, setPinnedPreview] = useState<string | null>(null);

  const genRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Map<number, HTMLElement>>(new Map());
  const metaRef = useRef<ChatMeta | null>(null);
  const viewRef = useRef<ViewState | null>(null);

  metaRef.current = meta;
  viewRef.current = view;

  const messagesById = useMemo(() => {
    const m = new Map<number, Message>();
    if (view) for (const msg of view.messages) m.set(msg.i, msg);
    return m;
  }, [view]);

  const albumGroups = useMemo(() => {
    if (!view) return new Map<number, AlbumItem[]>();
    return useAlbumGroups(view.messages, username);
  }, [view, username]);

  // Load meta and initial chunk
  useEffect(() => {
    let cancelled = false;
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    setView(null);
    setMeta(null);
    setAvatarIdx({});
    setChatAvatar(undefined);

    loadMeta(username).then(async (m) => {
      if (cancelled || gen !== genRef.current) return;
      setMeta(m);
      if (m.pinned_id) setPinnedPreview('置顶消息');

      let targetChunk = m.chunks[m.chunks.length - 1];
      if (initialMsgId) {
        const found = m.chunks.find((c) => c.first_id <= initialMsgId && c.last_id >= initialMsgId);
        if (found) targetChunk = found;
      }

      try {
        const msgs = await loadChunk(username, targetChunk.file);
        if (cancelled || gen !== genRef.current) return;
        setView({ first: m.chunks.indexOf(targetChunk), last: m.chunks.indexOf(targetChunk), messages: msgs });
        setLoading(false);

        if (initialMsgId) {
          setTimeout(() => scrollToMsg(initialMsgId, true), 100);
        } else {
          setTimeout(() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }, 50);
        }
      } catch {
        if (!cancelled && gen === genRef.current) {
          setError('加载失败');
          setLoading(false);
        }
      }
    }).catch(() => {
      if (!cancelled && gen === genRef.current) {
        setError('加载失败');
        setLoading(false);
      }
    });

    loadAvatarIndex(username).then((idx) => {
      if (cancelled || gen !== genRef.current) return;
      setAvatarIdx(idx);
      if (idx.chat?.ok) setChatAvatar(`./data/${username}/avatars/chat.jpg?t=${idx.chat.ts}`);
    });

    return () => { cancelled = true; };
  }, [username, initialMsgId]);

  // Scroll to message
  const scrollToMsg = useCallback((msgId: number, highlight?: boolean) => {
    const el = msgRefs.current.get(msgId);
    if (el) {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      if (highlight) {
        setHighlightId(msgId);
        setTimeout(() => setHighlightId(null), 2200);
      }
    }
  }, []);

  // Jump to message (may need to load chunk)
  const jumpTo = useCallback(async (msgId: number) => {
    const m = metaRef.current;
    if (!m) return;
    const inView = viewRef.current?.messages.some((msg) => msg.i === msgId);
    if (inView) {
      scrollToMsg(msgId, true);
      return;
    }
    const chunk = m.chunks.find((c) => c.first_id <= msgId && c.last_id >= msgId);
    if (!chunk) return;
    const gen = ++genRef.current;
    setBusy(true);
    try {
      const msgs = await loadChunk(username, chunk.file);
      if (gen !== genRef.current) return;
      const idx = m.chunks.indexOf(chunk);
      setView({ first: idx, last: idx, messages: msgs });
      setTimeout(() => scrollToMsg(msgId, true), 100);
    } catch {
      // ignore
    } finally {
      if (gen === genRef.current) setBusy(false);
    }
  }, [username, scrollToMsg]);

  // Lazy load older/newer chunks
  const loadOlder = useCallback(async () => {
    const m = metaRef.current;
    const v = viewRef.current;
    if (!m || !v || v.first <= 0 || busy) return;
    const gen = genRef.current;
    setBusy(true);
    const prevScroll = scrollRef.current?.scrollTop || 0;
    const prevHeight = scrollRef.current?.scrollHeight || 0;
    try {
      const chunk = m.chunks[v.first - 1];
      const msgs = await loadChunk(username, chunk.file);
      if (gen !== genRef.current) return;
      setView({ first: v.first - 1, last: v.last, messages: [...msgs, ...v.messages] });
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = prevScroll + (el.scrollHeight - prevHeight);
      });
    } catch {
      // ignore
    } finally {
      if (gen === genRef.current) setBusy(false);
    }
  }, [username, busy]);

  const loadNewer = useCallback(async () => {
    const m = metaRef.current;
    const v = viewRef.current;
    if (!m || !v || v.last >= m.chunks.length - 1 || busy) return;
    const gen = genRef.current;
    setBusy(true);
    try {
      const chunk = m.chunks[v.last + 1];
      const msgs = await loadChunk(username, chunk.file);
      if (gen !== genRef.current) return;
      setView({ first: v.first, last: v.last + 1, messages: [...v.messages, ...msgs] });
    } catch {
      // ignore
    } finally {
      if (gen === genRef.current) setBusy(false);
    }
  }, [username, busy]);

  // Intersection observers for lazy loading
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

  // Scroll listener for back-to-bottom button
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight * 1.5;
    const hasNewer = meta && view && view.last < meta.chunks.length - 1;
    setShowBackToBottom(!nearBottom || !!hasNewer);
  };

  const scrollToBottom = async () => {
    const m = metaRef.current;
    const v = viewRef.current;
    if (!m || !v) return;
    if (v.last < m.chunks.length - 1) {
      const gen = ++genRef.current;
      setBusy(true);
      try {
        const chunk = m.chunks[m.chunks.length - 1];
        const msgs = await loadChunk(username, chunk.file);
        if (gen !== genRef.current) return;
        setView({ first: v.first, last: m.chunks.length - 1, messages: [...v.messages, ...msgs] });
      } catch { /* ignore */ } finally {
        if (gen === genRef.current) setBusy(false);
      }
    }
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
  };

  // Pull-to-refresh
  const pullRef = useRef({ pulling: false, startY: 0, dist: 0 });
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  const cancelPull = () => {
    pullRef.current = { pulling: false, startY: 0, dist: 0 };
    setPullDist(0);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    // One finger only, at the very top, and never while a refresh is in flight.
    if (e.touches.length !== 1) {
      cancelPull();
      return;
    }
    const el = scrollRef.current;
    if (!el || refreshing || el.scrollTop > 0) return;
    const v = viewRef.current;
    const m = metaRef.current;
    if (!v || !m || v.last !== m.chunks.length - 1) return;
    pullRef.current = { pulling: true, startY: e.touches[0].clientY, dist: 0 };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!pullRef.current.pulling) return;
    if (e.touches.length !== 1) {
      cancelPull();
      return;
    }
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) {
      cancelPull();
      return;
    }
    const delta = e.touches[0].clientY - pullRef.current.startY;
    // Pushing up cancels the gesture instead of leaving a stuck indicator.
    if (delta <= 0) {
      cancelPull();
      return;
    }
    const damped = Math.min(70, delta * 0.5);
    pullRef.current.dist = damped;
    setPullDist(damped);
  };

  const onTouchEnd = async () => {
    if (!pullRef.current.pulling) return;
    const reached = pullRef.current.dist >= 56;
    pullRef.current = { pulling: false, startY: 0, dist: 0 };
    setPullDist(0);
    if (!reached) return;
    setRefreshing(true);
    try {
      const newMeta = await refreshMeta(username);
      const v = viewRef.current;
      if (!v) return;
      const oldChunks = metaRef.current?.chunks.length || 0;
      const newChunks = newMeta.chunks.length;

      if (newChunks > oldChunks) {
        const newOnes = newMeta.chunks.slice(oldChunks);
        const allMsgs: Message[] = [];
        for (const c of newOnes) {
          const msgs = await refreshChunk(username, c.file);
          allMsgs.push(...msgs);
        }
        setMeta(newMeta);
        setView({ first: v.first, last: newChunks - 1, messages: [...v.messages, ...allMsgs] });
      } else if (v.last === newChunks - 1) {
        const lastChunk = newMeta.chunks[newChunks - 1];
        const msgs = await refreshChunk(username, lastChunk.file);
        const existing = new Set(v.messages.map((m) => m.i));
        const newMsgs = msgs.filter((m) => !existing.has(m.i));
        if (newMsgs.length > 0) {
          setView({ first: v.first, last: v.last, messages: [...v.messages, ...newMsgs] });
        }
      }
    } catch {
      // ignore
    } finally {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => setRefreshing(false), 600);
    }
  };

  // Load pinned preview
  useEffect(() => {
    if (meta?.pinned_id && view) {
      const pinned = view.messages.find((m) => m.i === meta.pinned_id);
      if (pinned) setPinnedPreview(preview(pinned));
    }
  }, [meta, view]);

  // Update title
  useEffect(() => {
    const title = meta ? (meta as unknown as { title?: string }).title || username : username;
    document.title = `${title} - Telegram 聊天存档`;
  }, [username, meta]);

  const onOpenLightbox = (items: LightboxItem[], index: number) => setLightbox({ items, index });
  const onActionMenu = (msg: Message) => setActionMenu({ msg });

  const onOpenProfile = (userId: string | number) => {
    if (userId === '' || userId === undefined) return;
    setProfileUser(userId);
  };

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
          className="mobile-touch-target flex shrink-0 items-center gap-2 border-b border-border bg-yellow-50 px-3 py-1.5 text-left text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={cancelPull}
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
                  className="mobile-touch-target inline-flex items-center justify-center px-3 text-xs text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {busy ? '加载中…' : '加载更早消息'}
                </button>
              </div>
            )}
            {view.first <= 0 && view.messages.length > 0 && (
              <div className="flex justify-center py-2 text-xs text-muted-foreground">已到最早消息</div>
            )}

            {view.messages.map((msg, idx) => {
              const prev = view.messages[idx - 1];
              const next = view.messages[idx + 1];
              const album = albumGroups.get(msg.i);
              const uid = msg.u !== undefined ? String(msg.u) : (msg.n || '');
              const userAv = avatarIdx.ok?.[uid] ? buildUserAvatarUrl(username, uid, avatarIdx.ok[uid]) : undefined;
              return (
                <div key={msg.i} ref={(el) => { if (el) msgRefs.current.set(msg.i, el); }}>
                  <MessageItem
                    msg={msg}
                    prev={prev}
                    next={next}
                    username={username}
                    chatAvatar={chatAvatar}
                    chatTitle={username}
                    onOpenLightbox={onOpenLightbox}
                    onJumpTo={jumpTo}
                    onOpenProfile={onOpenProfile}
                    onActionMenu={onActionMenu}
                    messagesById={messagesById}
                    highlight={highlightId === msg.i}
                    albumItems={album}
                    avatarUrl={userAv}
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
                  className="mobile-touch-target inline-flex items-center justify-center px-3 text-xs text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
          className="mobile-touch-target absolute bottom-4 right-4 z-[var(--app-z-floating)] flex items-center justify-center rounded-full bg-card shadow-lg transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          msg={actionMenu.msg}
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
          avatarUrl={avatarIdx.ok?.[String(profileUser)] ? buildUserAvatarUrl(username, String(profileUser), avatarIdx.ok[String(profileUser)]) : undefined}
        />
      )}
    </div>
  );
}

