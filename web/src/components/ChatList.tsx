import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, RefreshCw, Moon, Sun } from 'lucide-react';
import type { ChatSummary } from '@/types';
import { fmtListDate } from '@/utils';
import { loadChats, refreshChats, loadAvatarIndex } from '@/data';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/Avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ChatListProps {
  activeUsername?: string;
  onSelect: (username: string) => void;
}

type TimeFilter = 'all' | '7d' | '30d';

const TIME_FILTERS: { value: TimeFilter; label: string; days?: number }[] = [
  { value: 'all', label: '全部' },
  { value: '7d', label: '近7天', days: 7 },
  { value: '30d', label: '近30天', days: 30 },
];

/** Pull-to-refresh travel needed before a release triggers a reload. */
const PULL_THRESHOLD = 60;
const PULL_MAX = 80;

/** The search box only earns its space once the list is long enough to scan. */
const SEARCH_MIN_CHATS = 6;

type ChatAvatars = Record<string, { ok: number; ts: number }>;

export function ChatList({ activeUsername, onSelect }: ChatListProps) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [avatarIdx, setAvatarIdx] = useState<ChatAvatars>({});
  const listRef = useRef<HTMLDivElement>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  /** Avatars are fetched at most once per chat, so this set guards re-entry. */
  const requestedAvatars = useRef<Set<string>>(new Set());

  const fetchChats = useCallback(async (isRefresh?: boolean) => {
    try {
      setError(null);
      setChats(isRefresh ? await refreshChats() : await loadChats());
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const days = TIME_FILTERS.find((f) => f.value === timeFilter)?.days;
    const cutoff = days ? Date.now() / 1000 - days * 86400 : 0;
    return chats
      .filter((c) => {
        if (days && c.last_date < cutoff) return false;
        if (terms.length === 0) return true;
        const hay = `${c.title || ''} ${c.username}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .sort((a, b) => b.last_date - a.last_date);
  }, [chats, query, timeFilter]);

  const loadAvatars = useCallback(async (list: ChatSummary[]) => {
    const pending = list.filter((c) => !requestedAvatars.current.has(c.username));
    if (pending.length === 0) return;
    for (const c of pending) requestedAvatars.current.add(c.username);

    const loaded = await Promise.all(pending.map(async (c): Promise<[string, { ok: number; ts: number }] | null> => {
      const idx = await loadAvatarIndex(c.username);
      const chat = idx.chat;
      return chat?.ok ? [c.username, { ok: chat.ok, ts: chat.ts }] : null;
    }));

    setAvatarIdx((prev) => {
      const next = { ...prev };
      for (const entry of loaded) if (entry) next[entry[0]] = entry[1];
      return next;
    });
  }, []);

  useEffect(() => {
    if (chats.length > 0) loadAvatars(chats);
  }, [chats, loadAvatars]);

  const { distance: pullDist, refreshing, handlers: pullHandlers } = usePullToRefresh({
    scrollRef: listRef,
    threshold: PULL_THRESHOLD,
    max: PULL_MAX,
    onRefresh: () => fetchChats(true),
  });

  const clearFilters = () => {
    setQuery('');
    setTimeFilter('all');
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-grouped">
      <div className="flex shrink-0 items-end justify-between gap-2 px-4 pb-2 pt-4">
        <h1 className="min-w-0 truncate text-ios-large-title text-foreground">聊天存档</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          className="mobile-touch-target shrink-0 rounded-full"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </Button>
      </div>

      {chats.length >= SEARCH_MIN_CHATS && (
        <div className="shrink-0 px-4 pb-3">
          <div className="flex min-h-11 items-center gap-2 rounded-ios-field bg-muted px-3">
            <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索群聊"
              aria-label="搜索群聊"
              className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="清空搜索"
                className="mobile-touch-target -mr-1 flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="mt-2.5 flex rounded-ios-segment bg-muted p-0.5" role="group">
            {TIME_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTimeFilter(value)}
                aria-pressed={timeFilter === value}
                className={`mobile-touch-target flex-1 rounded-[7px] py-1 text-ios-subhead transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  timeFilter === value
                    ? 'bg-card font-semibold text-foreground shadow-ios-segment'
                    : 'font-medium text-muted-foreground'
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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+var(--app-safe-bottom))]"
        {...pullHandlers}
      >
        {/* `overflow-hidden` is load-bearing: at rest the height is 0 while the
            icon keeps its own height and a negative margin, so without clipping
            it escapes the box and reads as a permanently visible refresh button. */}
        <div className="flex justify-center overflow-hidden" style={{ height: pullDist }}>
          <RefreshCw
            size={20}
            aria-hidden="true"
            className={`text-muted-foreground transition ${refreshing ? 'animate-spin' : ''}`}
            style={{ marginTop: pullDist / 2 - 10 }}
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 text-ios-subhead text-muted-foreground">
            加载中…
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-8 text-ios-subhead text-muted-foreground">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => fetchChats()}
              className="mobile-touch-target mt-2 inline-flex items-center justify-center px-3 text-primary transition-opacity active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-ios-subhead text-muted-foreground">
            {chats.length === 0 ? (
              <p>暂无群组</p>
            ) : (
              <>
                <p>无匹配群聊</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mobile-touch-target mt-2 inline-flex items-center justify-center px-3 text-primary transition-opacity active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  清除条件
                </button>
              </>
            )}
          </div>
        )}

        {visible.length > 0 && (
          <div className="overflow-hidden rounded-ios-card bg-card shadow-ios-card">
            {visible.map((c, index) => {
              const av = avatarIdx[c.username];
              const isActive = activeUsername === c.username;
              const isLastRow = index === visible.length - 1;
              return (
                <button
                  key={c.username}
                  type="button"
                  onClick={() => onSelect(c.username)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex w-full min-w-0 items-center gap-3 px-4 text-left transition-colors ${
                    isActive ? 'bg-primary/10' : 'active:bg-secondary'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
                >
                  <Avatar
                    src={av?.ok ? `./data/${c.username}/avatars/chat.jpg?t=${av.ts}` : undefined}
                    name={c.title || c.username}
                    seed={c.username}
                    size={48}
                  />
                  <div
                    className={`flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 ${
                      isLastRow ? '' : 'border-b border-separator'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-ios-body text-foreground">
                        {c.title || c.username}
                      </span>
                      <span className="shrink-0 text-ios-footnote text-muted-foreground">
                        {fmtListDate(c.last_date)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-ios-footnote text-muted-foreground">{c.lp}</span>
                      <span className="shrink-0 text-ios-footnote text-muted-foreground">
                        {c.count > 999 ? '999+' : c.count}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
