import { experimental_streamedQuery as streamedQuery, useQuery } from '@tanstack/react-query'
import { ToggleGroup } from 'radix-ui'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { ChevronDown, Close, Users as UsersIcon } from '../components/Icons'
import { GlassButton } from '../components/NavBar'
import { SearchField } from '../components/SearchField'
import { Sheet } from '../components/Sheet'
import { CenterState, ErrorState, LoadState } from '../components/States'
import { dataUrl } from '../lib/api'
import { afterTransition, yieldToMain } from '../lib/idle'
import { MEDIA_KINDS, hayOf, norm, scanBatches } from '../lib/scan'
import { count, shortDate, timeOf } from '../lib/format'
import { useDebounce } from 'use-debounce'
import { rememberSearch } from '../lib/lastSearch'
import { setSearchNav } from '../lib/searchNav'
import { goBack, navigate, paths } from '../lib/router'
import { blurActiveInput } from '../lib/viewport'
import { activeMembers, mediaLabel, userName } from '../lib/text'
import { useDocumentTitle } from '../lib/theme'
import type { ChatMeta, Message, Users } from '../lib/types'
import { useChat } from '../lib/useChat'
import { perChat } from '../lib/store'
import { Card, MemberRow } from '../components/List'
import { inAlbum } from '../chat/grouping'

const LIMIT = 1000

interface Hit {
  m: Message
  snippet: string
}

interface SearchState {
  hits: Hit[]
  progress: number
}

const EMPTY: SearchState = { hits: [], progress: 0 }
const YIELD_EVERY = 100

const TYPES = MEDIA_KINDS
/** 空格分隔的多个关键词，需全部命中 */
const termsOf = (q: string) => norm(q).split(/\s+/).filter(Boolean)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termsRe = (terms: string[]) => (terms.length ? new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi') : null)

function snippetAround(text: string, re: RegExp | null): string {
  const flat = text.replace(/\s+/g, ' ')
  re && (re.lastIndex = 0)
  const idx = re ? flat.search(re) : -1
  if (idx < 0) return flat.slice(0, 120)
  const start = Math.max(0, idx - 24)
  return (start > 0 ? '…' : '') + flat.slice(start, idx + 120)
}

// 从消息返回搜索页时直接复用上次的结果和滚动位置
const lastScroll = new Map<string, number>()
const lastShown = new Map<string, number>()
const PAGE_ROWS = 30
/** 新结果首帧渲染的行数 */
const FIRST_ROWS = 16

/** 前端全文搜索：按从新到旧顺序逐块加载并匹配 */
function useSearch(meta: ChatMeta | undefined, q: string, from?: number, type?: string) {
  const terms = termsOf(q)
  const typeTest = TYPES.find((t) => t.key === type)?.test
  const active = !!meta && (terms.length > 0 || from != null || !!typeTest)
  const key = meta ? `${meta.id}|${meta.updatedAt ?? ''}|${terms.join(' ')}|${from ?? ''}|${type ?? ''}` : ''
  const query = useQuery({
    queryKey: ['search', key],
    enabled: active,
    gcTime: 5 * 60_000,
    queryFn: streamedQuery<SearchState, SearchState, readonly [string, string]>({
      streamFn: async function* ({ signal }) {
        const re = termsRe(terms)
        const found: Hit[] = []
        for await (const { msgs, progress } of scanBatches(meta!)) {
          for (let k = 0; k < msgs.length && found.length < LIMIT; k++) {
            if (k % YIELD_EVERY === 0) await yieldToMain()
            if (signal.aborted) return
            const m = msgs[k]
            if (m.svc || (from != null && m.from !== from) || (typeTest && !typeTest(m))) continue
            const [hay, h] = hayOf(m)
            if (terms.length && !terms.every((t) => h.includes(t))) continue
            found.push({ m, snippet: hay ? snippetAround(hay, re) : '' })
          }
          yield { hits: found.slice(), progress: found.length >= LIMIT ? 1 : progress }
          if (found.length >= LIMIT) return
        }
      },
      reducer: (_, chunk) => chunk,
      initialValue: EMPTY,
    }),
  })
  return {
    hits: query.data?.hits ?? EMPTY.hits,
    progress: query.data?.progress ?? 0,
    done: !active || (query.isSuccess && !query.isFetching),
    error: query.error,
    key,
  }
}

// ---- 最近搜索（仅保存在本机）

const RECENT_MAX = 8
const recents = perChat<string[]>('recentSearches')
const loadRecent = (chatId: number) => recents.get(chatId) ?? []
const saveRecent = (chatId: number, list: string[]) => recents.set(chatId, list.length ? list : undefined)

export function SearchPage({ chatKey, q, from, type }: { chatKey: string; q: string; from?: number; type?: string }) {
  const { chat: ready, error: loadError, retry } = useChat(chatKey)
  const meta = ready?.meta
  const users: Users = useMemo(() => ready?.users ?? {}, [ready])
  useDocumentTitle(meta ? `搜索 · ${meta.title}` : '搜索')

  const [input, setInput] = useState(q)
  const [debounced] = useDebounce(input, 180)
  useEffect(() => {
    if (debounced !== q) navigate(paths.search(chatKey, debounced, from, type), { replace: true })
    // 只在输入停顿后同步，避免与筛选条件切换互相覆盖
  }, [debounced])
  // 地址被外部改变（如点击最近搜索）时同步输入框
  useEffect(() => {
    setInput((v) => (v.trim() === q.trim() ? v : q))
  }, [q])

  const { hits, progress, done, error, key } = useSearch(meta, q, from, type)
  useEffect(() => {
    if (meta) rememberSearch(meta.id, { q, from, type })
  }, [meta, q, from, type])
  const inputRef = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const needle = q.trim()
  const terms = useMemo(() => termsOf(q), [q])
  const re = useMemo(() => termsRe(terms), [terms])
  const active = !!needle || from != null || !!type
  const [picking, setPicking] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    if (meta) setRecent(loadRecent(meta.id))
  }, [meta])

  // 跳转时带上输入框里尚未同步到地址的内容
  const go = (next: { q?: string; from?: number | null; type?: string | null }) =>
    navigate(
      paths.search(chatKey, next.q ?? input, next.from === null ? undefined : (next.from ?? from), next.type === null ? undefined : (next.type ?? type)),
      { replace: true },
    )
  const setFrom = (id?: number) => go({ from: id ?? null })

  const remember = (text: string) => {
    const t = text.trim()
    if (!meta || !t) return
    const list = [t, ...recent.filter((r) => r !== t)].slice(0, RECENT_MAX)
    setRecent(list)
    saveRecent(meta.id, list)
  }
  const clearRecent = () => {
    if (!meta) return
    setRecent([])
    saveRecent(meta.id, [])
  }

  // 恢复返回前的滚动位置
  const [shownState, setShownState] = useState<{ key: string; n: number }>({ key, n: lastShown.get(key) ?? FIRST_ROWS })
  const shown = shownState.key === key ? shownState.n : (lastShown.get(key) ?? FIRST_ROWS)
  const setShownFor = (k: string, n: number) => setShownState({ key: k, n })
  // 新结果先只排版一屏多一点，其余在空闲时补齐，输入后结果立刻出现
  useEffect(() => {
    if (shown >= PAGE_ROWS || hits.length <= shown) return
    return afterTransition(() => setShownFor(key, PAGE_ROWS))
  }, [shown, hits.length, key])

  const restored = useRef('')
  useLayoutEffect(() => {
    if (!done || restored.current === key || !scroller.current) return
    restored.current = key
    scroller.current.scrollTop = lastScroll.get(key) ?? 0
  }, [done, key])

  const topMembers = useMemo(() => activeMembers(users).slice(0, 12), [users])

  return (
    <div className="relative h-full bg-bg">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 pt-[var(--safe-top)]">
        <div aria-hidden className="edge-top absolute inset-x-0 top-0 h-[calc(100%+16px)]" />
        <div className="se-row pointer-events-auto relative mx-auto flex h-[var(--nav-h)] max-w-3xl items-center gap-2 px-3">
          <SearchField
            ref={inputRef}
            value={input}
            onChange={setInput}
            onSubmit={() => {
              go({ q: input })
              remember(input)
            }}
            placeholder={meta ? `在「${meta.title}」中搜索` : '搜索'}
            autoFocus={!active}
            glass
          />
          <GlassButton label="关闭搜索" onClick={() => goBack(paths.chat(chatKey))} icon={<Close size={18} />} />
        </div>
        {meta && (
          <div className="se-chips no-scrollbar pointer-events-auto relative mx-auto mt-[var(--player-h)] flex max-w-3xl items-center gap-2 overflow-x-auto px-3 pt-1 pb-2.5">
            {from != null ? (
              <div data-press className="glass flex h-[34px] max-w-[60%] shrink-0 items-center rounded-full text-[14px] text-accent">
                <button onClick={() => setPicking(true)} className="flex h-full min-w-0 items-center gap-1.5 pl-1.5">
                  <Avatar id={from} name={userName(users, from)} src={users[String(from)]?.avatar} size={22} />
                  <span className="truncate">来自：{userName(users, from)}</span>
                </button>
                <button onClick={() => setFrom(undefined)} className="shrink-0 py-1 pr-2 pl-1.5" aria-label="清除成员筛选">
                  <Close size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPicking(true)}
                data-press
                className="glass glass-press flex h-[34px] shrink-0 items-center gap-1 rounded-full pr-3 pl-3.5 text-[14px] text-label"
              >
                <UsersIcon size={15} />
                成员
                <ChevronDown size={13} />
              </button>
            )}
            <ToggleGroup.Root
              type="single"
              value={type ?? ''}
              onValueChange={(v) => go({ type: v || null })}
              aria-label="消息类型"
              className="contents"
            >
              {TYPES.map((t) => (
                <ToggleGroup.Item
                  key={t.key}
                  value={t.key}
                  data-press
                  className={`glass-press h-[34px] shrink-0 rounded-full px-4 text-[14px] ${type === t.key ? 'bg-accent font-medium text-white shadow-[0_2px_10px_color-mix(in_srgb,var(--accent)_40%,transparent)]' : 'glass text-label'}`}
                >
                  {t.label}
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
          </div>
        )}
        {!done && (
          <div className="relative mx-auto h-[3px] max-w-3xl px-4">
            <div className="h-full origin-left rounded-full bg-accent transition-transform duration-300" style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
          </div>
        )}
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          if (active) lastScroll.set(key, el.scrollTop)
          if (shown < hits.length && el.scrollTop + el.clientHeight > el.scrollHeight - 900) setShownFor(key, shown + PAGE_ROWS)
        }}
        onTouchMove={blurActiveInput}
        className="scroller absolute inset-0 pt-[calc(var(--safe-top)+var(--nav-h)+48px+var(--player-h))] pb-[calc(var(--safe-bottom)+var(--kb))]"
      >
        <div className="se-body mx-auto max-w-3xl">
          {!ready && <LoadState error={loadError} retry={retry} />}
          {error && <ErrorState error={error} />}
          {meta && !active && (
            <div className="pt-2">
              {recent.length > 0 && (
                <section className="mb-4">
                  <div className="flex items-center px-4 pt-2 pb-1.5 text-[13px] text-label2">
                    <span className="flex-1">最近搜索</span>
                    <button onClick={clearRecent} data-press className="text-accent" style={{ '--press': 1.15 } as React.CSSProperties}>
                      清除
                    </button>
                  </div>
                  <ul>
                    {recent.map((r) => (
                      <li key={r}>
                        <button onClick={() => go({ q: r })} data-press className="press-row hairline-b flex w-full items-center gap-3 px-4 py-2.5 text-left text-[16px] text-label">
                          <span className="text-label3">↺</span>
                          <span className="min-w-0 flex-1 truncate">{r}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {topMembers.length > 0 && (
                <section className="mb-4">
                  <div className="px-4 pt-2 pb-2 text-[13px] text-label2">查看成员的消息</div>
                  <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
                    {topMembers.map(([id, u]) => (
                      <button key={id} onClick={() => setFrom(Number(id))} data-press className="flex w-[62px] shrink-0 flex-col items-center gap-1" style={{ '--press': 1.12 } as React.CSSProperties}>
                        <Avatar id={Number(id)} name={u.name} src={u.avatar} size={52} />
                        <span className="w-full truncate text-center text-[12px] text-label">{u.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <CenterState>
                <div className="text-[17px] text-label">搜索消息</div>
                <div className="text-[14px]">在 {count(meta.count ?? 0)} 条消息中查找文字、文件名、链接和投票，多个关键词用空格分开</div>
              </CenterState>
            </div>
          )}
          {meta && active && (
            <>
              <div className="px-4 pt-3 pb-1 text-[13px] text-label2">
                {done ? (hits.length >= LIMIT ? `显示最新的 ${LIMIT} 条结果` : `找到 ${hits.length} 条结果`) : `正在搜索… 已找到 ${hits.length} 条`}
              </div>
              {done && hits.length === 0 && (
                <CenterState>
                  <div className="text-[17px] text-label">没有找到相关消息</div>
                  {(from != null || type) && needle && (
                    <button onClick={() => go({ from: null, type: null })} data-press className="text-[15px] text-accent">
                      去掉筛选条件再搜索
                    </button>
                  )}
                </CenterState>
              )}
              <ul className="px-2">
                {hits.slice(0, shown).map(({ m, snippet }) => (
                  <li key={m.id}>
                    <a
                      href={'#' + paths.chat(chatKey, m.id)}
                      onClick={(e) => {
                        e.preventDefault()
                        if (scroller.current) lastScroll.set(key, scroller.current.scrollTop)
                        lastShown.set(key, shown)
                        remember(q)
                        if (meta)
                          setSearchNav({
                            chatId: meta.id,
                            items: hits.map((h) => ({ id: h.m.id, group: inAlbum(h.m) ? h.m.group : undefined })),
                            label: [from != null && `来自 ${userName(users, from)}`, needle && `“${needle}”`, TYPES.find((t) => t.key === type)?.label]
                              .filter(Boolean)
                              .join(' · '),
                            path: paths.search(chatKey, q, from, type),
                            partial: !done,
                          })
                        navigate(paths.chat(chatKey, m.id))
                      }}
                      data-press
                      className="press-row flex items-start gap-3 rounded-[20px] py-2.5 pr-2 pl-2 text-label no-underline"
                    >
                      <Avatar id={m.from ?? 0} name={userName(users, m.from)} src={m.from != null ? users[String(m.from)]?.avatar : undefined} size={44} />
                      <div className="flex min-w-0 flex-1 gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{userName(users, m.from)}</span>
                            <span className="shrink-0 text-[13px] text-label2" title={timeOf(m.date)}>
                              {shortDate(m.date)}
                            </span>
                          </div>
                          <div className="line-clamp-2 text-[15px] leading-snug text-label2">
                            {mediaLabel(m) && <span className="mr-1 text-label">{mediaLabel(m)}</span>}
                            <Highlight text={snippet} re={re} />
                          </div>
                        </div>
                        <Thumb m={m} />
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {meta && (
        <MemberPicker
          open={picking}
          onClose={() => setPicking(false)}
          users={users}
          chatId={meta.id}
          selected={from}
          onSelect={(id) => {
            setPicking(false)
            setFrom(id)
          }}
        />
      )}
    </div>
  )
}

/** 图片/视频结果右侧的缩略图 */
function Thumb({ m }: { m: Message }) {
  const md = m.media
  if (!md || !['photo', 'video', 'gif', 'round'].includes(md.type)) return null
  const src = md.type === 'photo' ? (md.file ?? md.thumb) : md.thumb
  if (!src) return null
  return <img src={dataUrl(src)} alt="" loading="lazy" decoding="async" className="mt-0.5 h-12 w-12 shrink-0 rounded-[6px] bg-fill object-cover" />
}

const PICKER_LIMIT = 200

/** 选择要筛选的发言成员，按发言数从多到少排列 */
function MemberPicker({
  open,
  onClose,
  users,
  chatId,
  selected,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  users: Users
  chatId: number
  selected?: number
  onSelect: (id: number) => void
}) {
  const [filter, setFilter] = useState('')
  useEffect(() => {
    if (open) setFilter('')
  }, [open])
  const members = useMemo(() => activeMembers(users, chatId), [users, chatId])
  const f = norm(filter.trim()).replace(/^@/, '')
  const list = f ? members.filter(([id, u]) => norm(u.name).includes(f) || u.username?.toLowerCase().includes(f) || id === f) : members

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="按成员筛选"
    >
      <div className="px-3 pb-2">
        <SearchField value={filter} onChange={setFilter} placeholder="搜索名字或用户名" />
      </div>
      {list.length === 0 && <div className="py-10 text-center text-[15px] text-label2">没有匹配的成员</div>}
      <Card className="mx-3 mb-3">
        {list.slice(0, PICKER_LIMIT).map(([id, u]) => (
          <MemberRow key={id} id={Number(id)} user={u} chatId={chatId} selected={selected === Number(id)} onClick={() => onSelect(Number(id))} />
        ))}
      </Card>
      {list.length > PICKER_LIMIT && <div className="pb-4 text-center text-[13px] text-label2">仅显示前 {PICKER_LIMIT} 位，输入名字查找更多</div>}
    </Sheet>
  )
}

/** 高亮所有关键词 */
function Highlight({ text, re }: { text: string; re: RegExp | null }) {
  if (!re) return <>{text}</>
  return (
    <>
      {text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}
    </>
  )
}
