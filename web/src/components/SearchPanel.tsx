import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { ChatMeta, Message } from '@/types';
import { loadChunk } from '@/data';
import { fmtTimeShort, nameColor, senderName } from '@/utils';
import { renderText } from '@/components/textRender';
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

const MAX_RESULTS = 2000;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 400;

export function SearchPanel({ username, meta, onClose, onJumpTo }: SearchPanelProps) {
  const isMobile = useIsMobile();
  const viewport = useVisualViewport();
  useBackButtonClose(true, onClose);

  const [query, setQuery] = useState('');
  const [sender, setSender] = useState('');
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

  const filtersActive = !!sender.trim() || !!dateFrom || !!dateTo || onlyMedia;
  const hasFilter = terms.length > 0 || filtersActive;

  const doSearch = useCallback(async () => {
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

    const fromTs = dateFrom ? new Date(dateFrom).getTime() / 1000 : 0;
    const toTs = dateTo ? (new Date(dateTo).getTime() + 86400) / 1000 : Infinity;
    const senderLower = sender.trim().toLowerCase();

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
        if (senderLower && !senderName(m).toLowerCase().includes(senderLower)) continue;
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

  const clearQuery = () => setQuery('');

  const visibleResults = results.slice(0, shown);

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
        className="mx-auto flex w-full flex-col gap-0 overflow-hidden p-0 md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-2xl"
      >
        <SheetHeader className="flex shrink-0 flex-row items-center gap-2 space-y-0 border-b border-border p-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭搜索"
            className="mobile-touch-target flex shrink-0 items-center justify-center rounded-full transition hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <SheetTitle className="min-w-0 truncate text-sm font-medium">搜索消息</SheetTitle>
        </SheetHeader>

        <div className="shrink-0 border-b border-border p-3">
          <div className="flex min-h-11 items-center gap-2 rounded-lg bg-muted px-2.5">
            <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
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
              enterKeyHint="search"
              className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            {query && (
              <button
                type="button"
                onClick={clearQuery}
                aria-label="清空关键词"
                className="mobile-touch-target flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Filters, status and results share one scroll region, so a short
            viewport can still reach every control and never collapses the
            results to zero height. */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: 'calc(0.75rem + var(--app-safe-bottom))' }}
        >
          <div className="border-b border-border p-3">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className="mobile-touch-target inline-flex items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
              筛选{filtersActive ? '（已启用）' : ''}
            </button>

            {showFilters && (
              <div className="mt-2 space-y-2">
                <Input
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  placeholder="发送者"
                  aria-label="按发送者筛选"
                  className="min-w-0"
                />
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
                <label className="mobile-touch-target flex cursor-pointer items-center gap-2 rounded-lg px-1 text-sm">
                  <input
                    type="checkbox"
                    checked={onlyMedia}
                    onChange={(e) => setOnlyMedia(e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span>仅媒体</span>
                </label>
              </div>
            )}
          </div>

          {!hasFilter && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              输入关键词或设置筛选条件开始搜索
            </p>
          )}

          {hasFilter && searching && (
            <p className="px-3 py-1.5 text-xs text-muted-foreground" role="status">
              搜索中… {progress.done}/{progress.total}
            </p>
          )}

          {hasFilter && !searching && failedChunks > 0 && (
            <p className="px-3 py-1.5 text-xs text-destructive" role="status">
              {failedChunks} 个分片读取失败，结果可能不完整
            </p>
          )}

          {hasFilter && !searching && totalHits > 0 && (
            <p className="px-3 py-1.5 text-xs text-muted-foreground" role="status">
              共 {totalHits} 条命中{totalHits > MAX_RESULTS ? `（仅显示前 ${MAX_RESULTS} 条）` : ''}
            </p>
          )}

          {visibleResults.map((r) => (
            <button
              key={r.msg.i}
              type="button"
              onClick={() => onJumpTo(r.msg.i)}
              className="flex w-full gap-2 border-b border-border px-3 py-2 text-left transition hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="min-w-0 truncate text-xs font-medium"
                    style={{ color: nameColor(r.msg.u ?? r.msg.n, r.msg.n) }}
                  >
                    {senderName(r.msg)}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {fmtTimeShort(r.msg.d)}
                  </span>
                </div>
                {r.snippet ? (
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {renderSnippet(r.snippet, terms)}
                  </p>
                ) : r.msg.m ? (
                  <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    [{r.msg.m}]
                  </span>
                ) : null}
                {r.msg.r && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">回复 #{r.msg.r}</p>
                )}
              </div>
            </button>
          ))}

          {results.length > shown && (
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE_SIZE)}
              className="mobile-touch-target flex w-full items-center justify-center px-3 text-xs text-primary transition-opacity active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              加载更多
            </button>
          )}

          {hasFilter && !searching && results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {failedChunks > 0 ? '分片读取失败，未能完成搜索' : '无匹配结果'}
            </p>
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
      return <mark key={i} className="rounded bg-yellow-200 px-0.5">{s.text}</mark>;
    }
    return <span key={i}>{s.text}</span>;
  });
}
