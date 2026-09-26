import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X, RefreshCw } from 'lucide-react';
import type { ChatSummary } from '@/types';
import { fmtListDate } from '@/utils';
import { loadChats, refreshChats, loadAvatarIndex } from '@/data';
import { Avatar } from '@/components/Avatar';
import { Input } from '@/components/ui/input';

interface ChatListProps {
  activeUsername?: string;
  onSelect: (username: string) => void;
}

type TimeFilter = 'all' | '7d' | '30d';

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
];

/** Pull-to-refresh travel needed before a release triggers a reload. */
const PULL_THRESHOLD = 60;
const PULL_MAX = 80;

export function ChatList({ activeUsername, onSelect }: ChatListProps) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [avatarIdx, setAvatarIdx] = useState<Record<string, { ok: number; ts: number }>>({});
  const [showSearch, setShowSearch] = useState(false);

  const pullState = useRef({ pulling: false, startY: 0, dist: 0 });
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** Avatars are fetched at most once per chat, so this set guards re-entry. */
  const requestedAvatars = useRef<Set<string>>(new Set());

  const fetchChats = useCallback(async (isRefresh?: boolean) => {
    try {
      setError(null);
      const data = isRefresh ? await refreshChats() : await loadChats();
      setChats(data);
      if (data.length >= 6) setShowSearch(true);
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const filtered = chats.filter((c) => {
    if (timeFilter !== 'all') {
      const days = timeFilter === '7d' ? 7 : 30;
      const cutoff = Date.now() / 1000 - days * 86400;
      if (c.last_date < cutoff) return false;
    }
    if (query.trim()) {
      const terms = query.trim().toLowerCase().split(/\s+/);
      const hay = `${c.title || ''} ${c.username}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.last_date - a.last_date);

  const loadAvatars = useCallback(async (list: ChatSummary[]) => {
    const pending = list.filter((c) => !requestedAvatars.current.has(c.username));
    for (const c of pending) {
      requestedAvatars.current.add(c.username);
      const idx = await loadAvatarIndex(c.username);
      if (idx.chat?.ok) {
        setAvatarIdx((prev) => ({ ...prev, [c.username]: { ok: idx.chat!.ok, ts: idx.chat!.ts } }));
      }
    }
  }, []);

  useEffect(() => {
    if (chats.length > 0) loadAvatars(chats);
  }, [chats, loadAvatars]);

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  const cancelPull = () => {
    pullState.current = { pulling: false, startY: 0, dist: 0 };
    setPullDist(0);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const el = listRef.current;
    // One finger only, at the very top, and never while a refresh is in flight.
    if (!el || e.touches.length !== 1 || refreshing || el.scrollTop > 0) {
      if (e.touches.length > 1) cancelPull();
      return;
    }
    pullState.current = { pulling: true, startY: e.touches[0].clientY, dist: 0 };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!pullState.current.pulling) return;
    if (e.touches.length !== 1) {
      cancelPull();
      return;
    }
    const el = listRef.current;
    if (!el || el.scrollTop > 0) {
      cancelPull();
      return;
    }
    const delta = e.touches[0].clientY - pullState.current.startY;
    // Pushing up cancels the gesture rather than just hiding the indicator.
    if (delta <= 0) {
      cancelPull();
      return;
    }
    const damped = Math.min(PULL_MAX, delta * 0.5);
    pullState.current.dist = damped;
    setPullDist(damped);
  };

  const onTouchEnd = async () => {
    if (!pullState.current.pulling) return;
    const reached = pullState.current.dist >= PULL_THRESHOLD;
    pullState.current = { pulling: false, startY: 0, dist: 0 };
    setPullDist(0);
    if (!reached) return;

    setRefreshing(true);
    await fetchChats(true);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setRefreshing(false), 600);
  };

  const clearFilters = () => {
    setQuery('');
    setTimeFilter('all');
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      {showSearch && (
        <div className="shrink-0 border-b border-border p-2">
          <div className="flex min-h-11 items-center gap-2 rounded-lg bg-muted px-2.5">
            <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索群聊..."
              aria-label="搜索群聊"
              className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="清空搜索"
                className="mobile-touch-target flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="mt-1 flex gap-1.5">
            {TIME_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTimeFilter(value)}
                aria-pressed={timeFilter === value}
                className={`mobile-touch-target inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  timeFilter === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={cancelPull}
      >
        <div className="flex justify-center" style={{ height: pullDist }}>
          <RefreshCw
            size={20}
            aria-hidden="true"
            className={`text-muted-foreground transition ${refreshing ? 'animate-spin' : ''}`}
            style={{ marginTop: pullDist / 2 - 10 }}
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            加载中…
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => fetchChats()}
              className="mobile-touch-target mt-2 inline-flex items-center justify-center px-3 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
            {chats.length === 0 ? (
              <p>暂无群组</p>
            ) : (
              <>
                <p>无匹配群聊</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mobile-touch-target mt-2 inline-flex items-center justify-center px-3 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  清除条件
                </button>
              </>
            )}
          </div>
        )}

        <div className="divide-y divide-border">
          {sorted.map((c) => {
            const av = avatarIdx[c.username];
            const avatarSrc = av?.ok ? `./data/${c.username}/avatars/chat.jpg?t=${av.ts}` : undefined;
            return (
              <button
                key={c.username}
                type="button"
                onClick={() => onSelect(c.username)}
                aria-current={activeUsername === c.username ? 'true' : undefined}
                className={`flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  activeUsername === c.username ? 'bg-accent' : ''
                }`}
              >
                <Avatar src={avatarSrc} name={c.title || c.username} seed={c.username} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {c.title || c.username}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtListDate(c.last_date)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{c.lp}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {c.count > 999 ? '999+' : c.count}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
