import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import type { AvatarIndex, ChatMeta, Message } from '@/types';
import { loadAvatarIndex, loadChunk, loadUsers } from '@/data';
import {
  buildUserAvatarUrl, fmtListDate, fmtTimeShort, hueStyle, senderName, localDayRange,
} from '@/utils';
import { renderText } from '@/components/textRender';
import { Avatar } from '@/components/Avatar';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { useBackButtonClose } from '@/hooks/useBackButtonClose';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export interface SearchPanelProps {
  username: string;
  meta: ChatMeta | null;
  onClose: () => void;
  onJumpTo: (msgId: number) => void;
}

interface SearchResult {
  msg: Message;
  snippet?: string;
}

/**
 * A sender filter is either a picked member or a raw string.
 *
 * Picking a member matches on identity (`msg.u`), which is exact and cheaper per
 * message than a substring scan. The string form is kept as a fallback for the
 * senders that are not in `users.json` — the fixture's deliberately "unregistered"
 * `{ n: '未登记访客' }` has a name but no id, and a picker alone could never offer
 * it.
 */
type SenderFilter =
  | { kind: 'user'; id: string; label: string }
  | { kind: 'text'; text: string };

interface SenderEntry {
  id: string;
  name: string;
  handle?: string;
}

const MAX_RESULTS = 2000;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 400;

/**
 * Date and time for a result row.
 *
 * `fmtListDate` already carries the time for today (`14:32`) but only the day for
 * anything older (`昨天`, `9/21`), so the time is appended only in the latter
 * case. An archive spans months, and a bare `14:32` says nothing about whether a
 * hit is from this morning or last year.
 */
function resultStamp(seconds: number): string {
  const day = fmtListDate(seconds);
  return day.includes(':') ? day : `${day} ${fmtTimeShort(seconds)}`;
}

export function SearchPanel({ username, meta, onClose, onJumpTo }: SearchPanelProps) {
  const isMobile = useIsMobile();
  const viewport = useVisualViewport();
  useBackButtonClose(true, onClose);

  const [query, setQuery] = useState('');
  const [sender, setSender] = useState<SenderFilter>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [onlyMedia, setOnlyMedia] = useState(false);
  // Filters start collapsed on phones to keep the result list tall, and
  // expanded on desktop where there is room for them.
  const [showFilters, setShowFilters] = useState(() => !isMobile);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [totalHits, setTotalHits] = useState(0);
  const [failedChunks, setFailedChunks] = useState(0);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [senders, setSenders] = useState<SenderEntry[]>([]);
  const [senderQuery, setSenderQuery] = useState('');
  const [showSenders, setShowSenders] = useState(false);
  const [avatarIdx, setAvatarIdx] = useState<AvatarIndex>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  /**
   * Monotonic query generation. Every new query (and every unmount) bumps it,
   * so a slow older search can never write over a newer one's results.
   */
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkCache = useRef<Map<string, Message[]>>(new Map());
  const composingRef = useRef(false);

  const terms = useMemo(
    () => [...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))],
    [query]
  );

  const filtersActive = !!sender || !!dateFrom || !!dateTo || onlyMedia;
  const hasFilter = terms.length > 0 || filtersActive;

  const doSearch = useCallback(async () => {
    // A new result set is a new list: staying scrolled where the previous query
    // left off hides the top hits, which are the ones that matter most.
    if (resultsRef.current) resultsRef.current.scrollTop = 0;

    if (!meta || !hasFilter) {
      generationRef.current += 1;
      setResults([]);
      setTotalHits(0);
      setFailedChunks(0);
      setSearching(false);
      return;
    }

    const generation = ++generationRef.current;
    const isCurrent = () => generation === generationRef.current;

    setSearching(true);
    setResults([]);
    setTotalHits(0);
    setFailedChunks(0);
    setShown(PAGE_SIZE);
    setProgress({ done: 0, total: meta.chunks.length });

    const fromTs = dateFrom ? localDayRange(dateFrom)[0] : 0;
    const toTs = dateTo ? localDayRange(dateTo)[1] : Infinity;
    const senderFilter = sender;

    const allResults: SearchResult[] = [];
    let hits = 0;
    let failed = 0;
    let scanned = 0;
    let frame = 0;

    /**
     * Publishes the running totals at most once per frame. An archive can hold
     * hundreds of chunks, and re-rendering the whole result list once per chunk
     * would cost more than the search itself. The call after the loop below is
     * the synchronous final one, so the last chunk never waits on a frame.
     */
    const publish = () => {
      frame = 0;
      if (!isCurrent()) return;
      setResults([...allResults]);
      setTotalHits(hits);
      setFailedChunks(failed);
      setProgress({ done: scanned, total: meta.chunks.length });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(publish);
    };

    for (let ci = meta.chunks.length - 1; ci >= 0; ci--) {
      if (!isCurrent()) return;

      const chunk = meta.chunks[ci];
      let msgs = chunkCache.current.get(chunk.file);
      if (!msgs) {
        try {
          msgs = await loadChunk(username, chunk.file);
          chunkCache.current.set(chunk.file, msgs);
        } catch {
          msgs = [];
          failed += 1;
        }
      }
      if (!isCurrent()) return;

      // Prefetch only ever fills the cache — it never touches React state, so a
      // superseded query cannot publish anything.
      for (let p = 1; p <= 2; p++) {
        const next = meta.chunks[ci - p];
        if (next && !chunkCache.current.has(next.file)) {
          loadChunk(username, next.file)
            .then((m) => chunkCache.current.set(next.file, m))
            .catch(() => {});
        }
      }

      const chunkResults: SearchResult[] = [];
      for (let mi = msgs.length - 1; mi >= 0; mi--) {
        const m = msgs[mi];
        if (onlyMedia && !m.m) continue;
        if (senderFilter) {
          if (senderFilter.kind === 'user') {
            // Identity, not a name: a picked member is matched on the id the
            // message carries, so renaming or two people sharing a name cannot
            // cross-contaminate the results.
            if (String(m.u ?? '') !== senderFilter.id) continue;
          } else if (!senderName(m).toLowerCase().includes(senderFilter.text.toLowerCase())) {
            continue;
          }
        }
        if (dateFrom && m.d < fromTs) continue;
        if (dateTo && m.d >= toTs) continue;
        if (terms.length > 0) {
          const hay = `${m.t || ''} ${m.doc || ''}`.toLowerCase();
          if (!terms.every((t) => hay.includes(t))) continue;
        }
        hits += 1;
        if (allResults.length < MAX_RESULTS) {
          let snippet: string | undefined;
          if (m.t && terms.length > 0) {
            const lower = m.t.toLowerCase();
            const firstHit = terms
              .map((t) => lower.indexOf(t))
              .filter((idx) => idx >= 0)
              .sort((a, b) => a - b)[0];
            if (firstHit !== undefined) {
              const start = Math.max(0, firstHit - 24);
              const end = Math.min(m.t.length, firstHit + 24);
              snippet =
                (start > 0 ? '…' : '') +
                m.t.substring(start, end) +
                (end < m.t.length ? '…' : '');
            }
          }
          chunkResults.push({ msg: m, snippet });
        }
      }

      allResults.push(...chunkResults);
      if (!isCurrent()) return;

      scanned = meta.chunks.length - ci;
      schedule();
    }

    if (frame) cancelAnimationFrame(frame);
    if (!isCurrent()) return;
    publish();
    setSearching(false);
  }, [meta, username, terms, sender, dateFrom, dateTo, onlyMedia, hasFilter]);

  const doSearchRef = useRef(doSearch);
  doSearchRef.current = doSearch;

  const scheduleSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearchRef.current(), SEARCH_DEBOUNCE_MS);
  }, []);

  // Keyword debounce. Kept keyed on the query alone so typing does not trigger
  // one search per recreated callback.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!hasFilter) {
      generationRef.current += 1;
      setResults([]);
      setTotalHits(0);
      setFailedChunks(0);
      setSearching(false);
      return;
    }

    // Never fire in the middle of an IME composition.
    if (composingRef.current) return;

    debounceRef.current = setTimeout(() => doSearchRef.current(), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, hasFilter]);

  // Filter fields apply immediately; there is nothing to debounce.
  useEffect(() => {
    if (hasFilter) doSearchRef.current();
  }, [sender, dateFrom, dateTo, onlyMedia, hasFilter]);

  useEffect(() => () => {
    generationRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // The roster is users.json rather than a scan of every chunk: it is the
  // archive's own member list, it costs one request that is already cached, and
  // its `n` is the very name the result rows render — so a pick and a row can
  // never disagree about who someone is.
  useEffect(() => {
    let cancelled = false;
    loadUsers(username).then((users) => {
      if (cancelled) return;
      setSenders(
        Object.entries(users)
          .map(([id, profile]) => ({
            id,
            name: profile.n || profile.un || `用户${id}`,
            handle: profile.un,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      );
    });
    return () => { cancelled = true; };
  }, [username]);

  useEffect(() => {
    let cancelled = false;
    loadAvatarIndex(username).then((idx) => { if (!cancelled) setAvatarIdx(idx); });
    return () => { cancelled = true; };
  }, [username]);

  const clearQuery = () => setQuery('');

  const clearFilters = () => {
    setSender(null);
    setSenderQuery('');
    setDateFrom('');
    setDateTo('');
    setOnlyMedia(false);
    setQuery('');
  };

  const senderLabel = sender
    ? sender.kind === 'user'
      ? sender.label
      : `文字：${sender.text}`
    : '发送者';

  /** The picked member's id, or null. Computed once rather than re-narrowing per row. */
  const selectedSenderId = sender && sender.kind === 'user' ? sender.id : null;

  const filteredSenders = useMemo(() => {
    const needle = senderQuery.trim().toLowerCase();
    if (!needle) return senders;
    return senders.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.handle || '').toLowerCase().includes(needle)
    );
  }, [senders, senderQuery]);

  const avatarUrlFor = useCallback(
    (id: string) => {
      const ts = avatarIdx.ok?.[id];
      return ts ? buildUserAvatarUrl(username, id, ts) : undefined;
    },
    [avatarIdx, username]
  );

  const visibleResults = results.slice(0, shown);
  const remaining = results.length - shown;

  const scanPercent =
    progress.total > 0 ? Math.min(100, (progress.done / progress.total) * 100) : 0;

  /**
   * One line, always on screen. It used to live inside the scroll region, so
   * scrolling the hits scrolled the progress and the hit count away with them.
   */
  const status = searching
    ? `搜索中… ${progress.done}/${progress.total}`
    : failedChunks > 0
      ? `${failedChunks} 个分片读取失败，结果可能不完整`
      : totalHits > 0
        ? `共 ${totalHits} 条命中${totalHits > MAX_RESULTS ? `（仅显示前 ${MAX_RESULTS} 条）` : ''}`
        : '';

  // On mobile the sheet tracks the visual viewport exactly, so the soft keyboard
  // never covers the input. `bottom: auto` cancels the base sheet's bottom
  // anchoring instead of fighting it.
  const mobileViewportStyle = isMobile
    ? {
        top: viewport.offsetTop,
        height: viewport.height,
        bottom: 'auto',
        maxHeight: 'none',
      }
    : undefined;

  return (
    <Sheet open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        onDismiss={onClose}
        style={mobileViewportStyle}
        // Radix would focus the first tabbable element, which is the close
        // button, leaving the field one tap away and the keyboard down. A search
        // sheet should open with the keyboard already up.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        className="mx-auto flex w-full flex-col gap-0 overflow-hidden p-0 md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-ios-sheet"
      >
        <SheetHeader className="flex shrink-0 flex-row items-center gap-2 space-y-0 border-b border-separator p-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭搜索"
            className="mobile-touch-target flex shrink-0 items-center justify-center rounded-full text-primary transition active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <SheetTitle className="min-w-0 truncate text-ios-headline">搜索消息</SheetTitle>
        </SheetHeader>

        <div className="shrink-0 px-3 pt-2.5">
          <div className="flex min-h-11 items-center gap-2 rounded-ios-field bg-muted px-3">
            <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => {
                composingRef.current = false;
                scheduleSearch();
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                // Mid-composition Enter only commits the IME candidate.
                if (composingRef.current || e.nativeEvent.isComposing) return;
                e.currentTarget.blur();
                doSearchRef.current();
              }}
              placeholder="关键词（空格分隔）"
              aria-label="搜索关键词"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            {query && (
              <button
                type="button"
                onClick={clearQuery}
                aria-label="清空关键词"
                className="mobile-touch-target -mr-1 flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Fixed-height track so the bar appearing cannot nudge the results. */}
          <div className="mt-1.5 h-[3px] overflow-hidden rounded-full" aria-hidden="true">
            {searching && (
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${scanPercent}%` }}
              />
            )}
          </div>
        </div>

        <div className="flex min-h-[18px] shrink-0 items-center gap-2 px-3 pt-1.5">
          <p className="min-w-0 flex-1 text-ios-caption1 text-muted-foreground" role="status">
            {status}
          </p>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="mobile-touch-target -mr-2 flex shrink-0 items-center gap-1.5 rounded-ios-field px-2 text-ios-footnote text-primary transition active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            筛选{filtersActive ? '（已启用）' : ''}
          </button>
        </div>

        {/* Capped and internally scrollable: expanding the filters on a short
            viewport must not squeeze the results to nothing. */}
        {showFilters && (
          <div className="max-h-[45%] shrink-0 overflow-y-auto overscroll-contain px-3 pb-2.5 pt-1.5">
            <div className="space-y-2">
              <div>
                <button
                  type="button"
                  onClick={() => setShowSenders((v) => !v)}
                  aria-expanded={showSenders}
                  aria-label="按发送者筛选"
                  className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-ios-field bg-secondary px-3 text-left text-ios-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={`min-w-0 truncate ${sender ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {senderLabel}
                  </span>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`shrink-0 text-muted-foreground transition-transform ${
                      showSenders ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showSenders && (
                  <div className="mt-2 overflow-hidden rounded-ios-field border border-separator">
                    <div className="border-b border-separator p-2">
                      <Input
                        value={senderQuery}
                        onChange={(e) => setSenderQuery(e.target.value)}
                        placeholder="搜索发送者"
                        aria-label="搜索发送者"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        className="min-w-0"
                      />
                    </div>

                    <div className="max-h-[216px] overflow-y-auto overscroll-contain">
                      {sender && (
                        <button
                          type="button"
                          onClick={() => {
                            setSender(null);
                            setSenderQuery('');
                            setShowSenders(false);
                          }}
                          className="flex w-full items-center border-b border-separator px-3 py-2.5 text-left text-ios-body text-primary transition-colors active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          清除选择
                        </button>
                      )}

                      {filteredSenders.map((entry) => {
                        const isSelected = selectedSenderId === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => {
                              setSender(
                                isSelected ? null : { kind: 'user', id: entry.id, label: entry.name }
                              );
                              setSenderQuery('');
                              setShowSenders(false);
                            }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            <Avatar
                              src={avatarUrlFor(entry.id)}
                              name={entry.name}
                              seed={entry.id}
                              size={28}
                            />
                            <span
                              className={`min-w-0 flex-1 truncate text-ios-body ${
                                isSelected ? 'font-semibold text-primary' : ''
                              }`}
                            >
                              {entry.name}
                            </span>
                            {entry.handle && entry.handle !== entry.name && (
                              <span className="shrink-0 text-ios-caption1 text-muted-foreground">
                                @{entry.handle}
                              </span>
                            )}
                            {isSelected && (
                              <Check size={16} className="shrink-0 text-primary" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}

                      {/* Fallback for senders users.json does not know about —
                          members who only ever appear as a bare name on a message. */}
                      {senderQuery.trim() !== '' && filteredSenders.length === 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSender({ kind: 'text', text: senderQuery.trim() });
                            setSenderQuery('');
                            setShowSenders(false);
                          }}
                          className="flex w-full items-center px-3 py-3 text-left text-ios-body text-primary transition-colors active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          按文字「{senderQuery.trim()}」筛选
                        </button>
                      )}

                      {senders.length === 0 && (
                        <p className="px-3 py-3 text-ios-footnote text-muted-foreground">
                          没有可选择的成员
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="起始日期"
                  className="min-w-0 flex-1"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="结束日期"
                  className="min-w-0 flex-1"
                />
              </div>
              <label className="mobile-touch-target flex cursor-pointer items-center gap-2 rounded-ios-field px-1 text-ios-body">
                <input
                  type="checkbox"
                  checked={onlyMedia}
                  onChange={(e) => setOnlyMedia(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span>仅媒体</span>
              </label>
            </div>
          </div>
        )}

        <div
          ref={resultsRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-separator"
          style={{ paddingBottom: 'calc(1rem + var(--app-safe-bottom))' }}
        >
          {!hasFilter && (
            <p className="px-3 py-6 text-center text-ios-subhead text-muted-foreground">
              输入关键词或设置筛选条件开始搜索
            </p>
          )}

          {visibleResults.map((r, index) => (
            <button
              key={r.msg.i}
              type="button"
              onClick={() => onJumpTo(r.msg.i)}
              className={`flex w-full gap-2 px-3 text-left transition-colors active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                index === visibleResults.length - 1 ? 'border-0' : 'border-b border-separator'
              }`}
            >
              <div className="min-w-0 flex-1 py-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className="name-color min-w-0 truncate text-ios-footnote font-semibold"
                    style={hueStyle(r.msg.u ?? r.msg.n, r.msg.n)}
                  >
                    {senderName(r.msg)}
                  </span>
                  <span className="shrink-0 text-ios-caption2 text-muted-foreground">
                    {resultStamp(r.msg.d)}
                  </span>
                </div>
                {r.snippet ? (
                  <p className="mt-0.5 break-words text-ios-footnote text-muted-foreground">
                    {renderSnippet(r.snippet, terms)}
                  </p>
                ) : r.msg.m ? (
                  <span className="mt-0.5 inline-block text-ios-footnote text-muted-foreground">
                    [{r.msg.m}]
                  </span>
                ) : null}
                {r.msg.r && (
                  <p className="mt-0.5 text-ios-caption2 text-muted-foreground">回复 #{r.msg.r}</p>
                )}
              </div>
            </button>
          ))}

          {remaining > 0 && (
            <div className="flex flex-col items-center gap-0.5 py-1">
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE_SIZE)}
                className="mobile-touch-target px-3 text-ios-subhead text-primary transition active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                加载更多
              </button>
              <span className="text-ios-caption1 text-muted-foreground">还有 {remaining} 条</span>
            </div>
          )}

          {hasFilter && !searching && results.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
              <p className="text-ios-subhead text-muted-foreground">
                {failedChunks > 0 ? '分片读取失败，未能完成搜索' : '无匹配结果'}
              </p>
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mobile-touch-target text-ios-subhead text-primary transition active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  清除筛选
                </button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function renderSnippet(snippet: string, terms: string[]) {
  const { segments } = renderText(snippet, terms);
  return segments.map((s, i) => {
    if (s.type === 'search') {
      return (
        <mark key={i} className="rounded-sm bg-system-yellow/40 px-0.5 text-foreground">
          {s.text}
        </mark>
      );
    }
    return <span key={i}>{s.text}</span>;
  });
}
