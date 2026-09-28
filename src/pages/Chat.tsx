import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Avatar } from '../components/Avatar'
import { Calendar, ChevronDown, Search } from '../components/Icons'
import { NavBar, NavButton } from '../components/NavBar'
import { ContextMenu } from '../components/ContextMenu'
import { CenterState, ErrorState, LoadState, Spinner } from '../components/States'
import { copyText, toast } from '../components/Toast'
import { CalendarSheet } from '../chat/CalendarSheet'
import { anchorIds, groupMessages } from '../chat/grouping'
import type { LightboxItem } from '../chat/Lightbox'
import { Lightbox } from '../lazy'
import { type ItemHandlers } from '../chat/MessageItem'
import { PinnedBar } from '../chat/PinnedBar'
import { TopicsPage } from './Topics'
import { ProfileSheet, profileLinks } from '../chat/ProfileSheet'
import { ThreadSheet } from '../chat/ThreadSheet'
import { useReplies } from '../lib/replies'
import { shareText } from '../lib/share'
import { topicResolver } from '../lib/topics'
import { countUpTo, getRead, markRead, useUnread } from '../lib/readState'
import { chunkFor, getChunk, peekChunk } from '../lib/api'
import { lastSearchPath } from '../lib/lastSearch'
import { useSearchNav } from '../lib/searchNav'
import { count, dayLabel, fullDate } from '../lib/format'
import { goBack, navigate, paths } from '../lib/router'
import { useDocumentTitle } from '../lib/theme'
import { mediaLabel, userName, withChat } from '../lib/text'
import type { ChatMeta, Message, Users } from '../lib/types'
import { useChat } from '../lib/useChat'
import { type Loaded, positions, type Target } from '../chat/viewState'
import { buildRows, firstMessageDate, firstMessageId, itemRowKey, lastMessageId, rowIndex } from '../chat/rows'
import { SearchNavBar } from '../chat/SearchNavBar'
import { SelectBars } from '../chat/SelectMode'
import { messageMenu } from '../chat/messageMenu'
import { type Clearance, type ListHandle, MessageList, type Place } from '../chat/MessageList'
import { noteScroll } from '../lib/scrolling'

export function ChatPage({ chatKey, msgId, pushed, topic, all }: { chatKey: string; msgId?: number; pushed?: boolean; topic?: number; all?: boolean }) {
  const { chat: ready, error, retry } = useChat(chatKey)
  if (!ready) {
    return (
      <div className="chat-bg relative h-full">
        <NavBar back={{ label: '群聊', onClick: () => goBack('/') }} title={error ? '' : '加载中…'} />
        <div className="pt-[calc(var(--safe-top)+var(--nav-h)+var(--player-h))]">
          <LoadState error={error} retry={retry} />
        </div>
      </div>
    )
  }
  if (ready.meta.forum && ready.meta.topics?.length && msgId == null && topic == null && !all) {
    return <TopicsPage chatKey={chatKey} meta={ready.meta} users={ready.users} />
  }
  return <ChatView key={`${ready.meta.id}:${topic ?? ''}`} chatKey={chatKey} meta={ready.meta} users={ready.users} msgId={msgId} pushed={pushed} topic={topic} />
}

function visibleMessages(loaded: Loaded[], topicOf: ((m: Message, get: (id: number) => Message | undefined) => number | undefined) | null, topic?: number): Message[] {
  const all = loaded.flatMap((c) => c.msgs)
  if (!topicOf) return all
  // 话题视图：只显示本话题的消息（话题创建本身不显示）
  const byId = new Map(all.map((m) => [m.id, m]))
  return all.filter((m) => m.svc?.type !== 'topic_create' && topicOf(m, (id) => byId.get(id)) === topic)
}

function ChatView({ chatKey, meta, users: rawUsers, msgId, pushed, topic }: { chatKey: string; meta: ChatMeta; users: Users; msgId?: number; pushed?: boolean; topic?: number }) {
  // 话题视图单独记录位置
  const posKey = topic ? `${meta.id}#${topic}` : String(meta.id)
  useDocumentTitle(meta.title)
  const users = useMemo(() => withChat(rawUsers, meta), [rawUsers, meta])
  const chunks = meta.chunks
  const lastN = chunks.length - 1
  const header = useRef<HTMLDivElement>(null)
  const safeBottom = useRef<HTMLDivElement>(null)
  const list = useRef<ListHandle>(null)
  // 打开时记下的已读位置：其后的消息为“新消息”，列表中插入分隔条
  const [unreadFrom] = useState(() => {
    if (topic) return null
    const r = getRead(meta.id)
    return r && meta.lastId && r.id < meta.lastId ? r.id : null
  })
  // 只在挂载时决定一次：点进指定消息时必须定位到它，即使上次停留时的路由恰好相同
  const [boot] = useState(() => {
    const jumping = !!pushed && msgId != null
    const stored = jumping ? undefined : positions.get(posKey)
    let target: Target = msgId ? { kind: 'msg', id: msgId, align: 'center', flash: true } : { kind: 'bottom' }
    if (stored && stored.route === msgId) {
      target = stored.bottom || stored.id == null ? { kind: 'bottom' } : { kind: 'msg', id: stored.id, align: 'offset', offset: stored.offset ?? 0 }
    }
    // 同官方：上次停在底部、之后又有新消息时，从第一条未读开始看
    if (!msgId && unreadFrom != null && (!stored || stored.bottom || stored.route !== msgId)) {
      target = { kind: 'msg', id: unreadFrom + 1, align: 'start', unread: true }
    }
    const n = target.kind === 'msg' ? chunkFor(chunks, target.id) : lastN
    const msgs = n >= 0 ? peekChunk(meta.id, n) : undefined
    return { target, loaded: msgs ? [{ n, msgs }] : null }
  })
  const [loaded, setLoaded] = useState<Loaded[]>(boot.loaded ?? [])
  const loadedRef = useRef(loaded)
  loadedRef.current = loaded
  const [gen, setGen] = useState<{ id: number; target: Target }>({ id: 0, target: boot.target })
  const generation = useRef(0)
  const busy = useRef({ up: false, down: false })
  const [error, setError] = useState<Error | null>(null)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [bottomState, setBottomState] = useState(true)
  const [calendar, setCalendar] = useState(false)
  const [menu, setMenu] = useState<{ msg: Message; el: HTMLElement } | null>(null)
  const [viewer, setViewer] = useState<number | null>(null)
  const [profile, setProfile] = useState<number | null>(null)
  const [thread, setThread] = useState<number | null>(null)
  const [topDay, setTopDay] = useState<string | null>(null)
  // 多选模式（同官方“选择”）：存所选消息所在条目的 key
  const [selected, setSelected] = useState<Set<number> | null>(null)
  const selecting = selected != null
  const selectingRef = useRef(false)
  selectingRef.current = selecting
  const toggleSelect = useCallback((key: number) => {
    setSelected((cur) => {
      const next = new Set(cur ?? [])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const unread = useUnread(meta.id, meta.count)
  const replyIdx = useReplies(meta)
  const lastJump = useRef<number | undefined>(msgId)
  const highlightTimer = useRef<number | undefined>(undefined)

  const topicOf = useMemo(() => (topic ? topicResolver(meta) : null), [meta, topic])
  const topicInfo = topic ? meta.topics?.find((t) => t.id === topic) : undefined
  const messages = useMemo(() => visibleMessages(loaded, topicOf, topic), [loaded, topicOf, topic])
  const days = useMemo(() => groupMessages(messages), [messages])
  const anchors = useMemo(() => anchorIds(days), [days])
  const firstUnreadKey = useMemo(() => {
    if (unreadFrom == null) return undefined
    const m = messages.find((x) => x.id > unreadFrom)
    return m ? anchors.get(m.id) : undefined
  }, [unreadFrom, messages, anchors])
  const rows = useMemo(() => buildRows(days, firstUnreadKey), [days, firstUnreadKey])
  const index = useMemo(() => rowIndex(rows), [rows])
  const live = useRef({ messages, anchors, rows, index })
  live.current = { messages, anchors, rows, index }
  const lo = loaded[0]?.n ?? 0
  const hi = loaded[loaded.length - 1]?.n ?? 0
  const atBottom = bottomState && hi === lastN

  // 置顶横幅的高度只作用于本页（多个聊天页同时保活，不能写到全局）
  const pageRoot = useRef<HTMLDivElement>(null)
  const [pinnedShown, setPinnedShown] = useState(false)

  // 导航栏、迷你播放条和置顶条浮在内容上，定位消息时一并让开
  const clearance = useCallback((): Clearance => {
    const root = getComputedStyle(pageRoot.current ?? document.documentElement)
    const extra = (parseFloat(root.getPropertyValue('--player-h')) || 0) + (parseFloat(root.getPropertyValue('--pinned-h')) || 0)
    const top = (header.current?.querySelector('header')?.getBoundingClientRect().height ?? 56) + extra
    const bottom = (safeBottom.current?.offsetHeight ?? 0) + (navRef.current ? 76 : 12)
    return { top, bottom }
  }, [])

  const placeOf = useCallback((t: Target): Place | 'bottom' => {
    if (t.kind === 'bottom') return 'bottom'
    const { messages: ms, anchors: an, index: ix } = live.current
    if (t.unread && ix.has('unread')) return { key: 'unread', align: 'start' }
    const m = ms.find((x) => x.id >= t.id) ?? ms[ms.length - 1]
    const k = m && an.get(m.id)
    return k != null ? { key: itemRowKey(k), align: t.align, offset: t.offset } : 'bottom'
  }, [])

  const flash = useCallback((key: number) => {
    setHighlight(null)
    requestAnimationFrame(() => setHighlight(key))
    window.clearTimeout(highlightTimer.current)
    highlightTimer.current = window.setTimeout(() => setHighlight(null), 1500)
  }, [])

  const openAt = useCallback(
    async (target: Target) => {
      if (!chunks.length) return
      const g = ++generation.current
      const n = target.kind === 'msg' ? chunkFor(chunks, target.id) : lastN
      try {
        const msgs = await getChunk(meta.id, n)
        if (g !== generation.current) return
        busy.current = { up: false, down: false }
        setLoaded([{ n, msgs }])
        setGen({ id: g, target })
        setError(null)
      } catch (e) {
        if (g === generation.current) setError(e as Error)
      }
    },
    [chunks, lastN, meta.id],
  )

  const loadMore = useCallback(
    async (dir: 'up' | 'down') => {
      const start = loadedRef.current
      if (busy.current[dir] || !start.length) return
      busy.current[dir] = true
      const g = generation.current
      const before = visibleMessages(start, topicOf, topic).length
      let edge = dir === 'up' ? start[0].n : start[start.length - 1].n
      const added: Loaded[] = []
      try {
        for (;;) {
          const n = dir === 'up' ? edge - 1 : edge + 1
          if (n < 0 || n > lastN) break
          const msgs = await getChunk(meta.id, n)
          if (g !== generation.current) return
          edge = n
          if (dir === 'up') added.unshift({ n, msgs })
          else added.push({ n, msgs })
          const merged = dir === 'up' ? [...added, ...start] : [...start, ...added]
          if (!topicOf || visibleMessages(merged, topicOf, topic).length > before) break
        }
        if (!added.length) return
        // 在帧开始时同步提交（见 MessageList 说明），滚动中插入新块也不会跳
        await new Promise<void>((r) => requestAnimationFrame(() => {
          if (g === generation.current)
            flushSync(() =>
              setLoaded((cur) => {
                const have = new Set(cur.map((c) => c.n))
                const fresh = added.filter((c) => !have.has(c.n))
                return dir === 'up' ? [...fresh, ...cur] : [...cur, ...fresh]
              }),
            )
          r()
        }))
      } catch (e) {
        setError(e as Error)
      } finally {
        if (g === generation.current) busy.current[dir] = false
      }
    },
    [lastN, meta.id, topicOf, topic],
  )

  useEffect(() => {
    if (!boot.loaded) void openAt(boot.target)
  }, [])

  const jumpTo = useCallback(
    (id: number) => {
      const { messages: ms, anchors: an } = live.current
      if (ms.length && ms[0].id <= id && id <= ms[ms.length - 1].id) {
        const m = ms.find((x) => x.id >= id)
        const k = m && an.get(m.id)
        if (k != null && list.current) {
          list.current.place({ key: itemRowKey(k), align: 'center' }, { smooth: true, onDone: () => flash(k) })
          return
        }
      }
      void openAt({ kind: 'msg', id, align: 'center', flash: true })
    },
    [openAt, flash],
  )

  /** 跳转并把位置写进地址栏，方便分享 */
  const go = useCallback(
    (id: number) => {
      lastJump.current = id
      jumpTo(id)
      navigate(paths.chat(chatKey, id), { replace: true })
    },
    [chatKey, jumpTo],
  )

  // 从回复/置顶跳转后记下来源消息，右下角按钮可逐级返回
  const [returnStack, setReturnStack] = useState<number[]>([])
  const returnRef = useRef(returnStack)
  returnRef.current = returnStack
  // 当前返回点的来源消息是否已经离开过视口；离开后再回到视口才算“自己滚回来了”
  const sourceAway = useRef(false)
  useEffect(() => {
    sourceAway.current = false
  }, [returnStack])

  const jumpFrom = useCallback(
    async (id: number, source?: number) => {
      // 先确认原消息在存档里，避免跳到不相干的位置
      try {
        const msgs = await getChunk(meta.id, chunkFor(chunks, id))
        if (!msgs.some((m) => m.id === id)) {
          toast(meta.firstId && id < meta.firstId ? '原消息早于存档起点' : '原消息已被删除或未存档')
          return
        }
      } catch {
        /* 加载失败时交给 go 处理并显示错误 */
      }
      if (source != null && source !== id) setReturnStack((s) => (s.at(-1) === source ? s : [...s.slice(-19), source]))
      go(id)
    },
    [chunks, meta.id, meta.firstId, go],
  )

  const nav = useSearchNav(meta.id)
  const navRef = useRef(nav)
  navRef.current = nav
  const backTo = returnStack.at(-1)
  // 自己滚到了最新消息：所有返回点都在更早的位置，全部作废（只在“到达底部”的那一刻清空，跳走时不受影响）
  useEffect(() => {
    if (atBottom) setReturnStack((st) => (st.length ? [] : st))
  }, [atBottom])
  const goBackToSource = () => {
    if (backTo == null) return
    setReturnStack((s) => s.slice(0, -1))
    go(backTo)
  }

  // 地址栏中的消息 id 变化（例如从搜索结果返回后点击另一条）
  useEffect(() => {
    if (msgId && msgId !== lastJump.current) {
      lastJump.current = msgId
      jumpTo(msgId)
    }
  }, [msgId, jumpTo])

  const rowAt = (key: string | null | undefined) => {
    const i = key == null ? undefined : live.current.index.get(key)
    return i == null ? undefined : live.current.rows[i]
  }

  const markVisibleRead = useCallback(() => {
    if (topic) return
    const id = lastMessageId(rowAt(list.current?.bottomRow()))
    if (id == null) return
    const chunk = loadedRef.current.find((c) => c.msgs.length && c.msgs[0].id <= id && id <= c.msgs[c.msgs.length - 1].id)
    if (chunk) markRead(meta.id, { id, n: countUpTo(chunks, chunk.n, chunk.msgs, id) })
  }, [topic, meta.id, chunks])

  const persistPos = useCallback(() => {
    const l = list.current
    const sc = l?.scroller()
    const cur = loadedRef.current
    if (!l || !sc || !cur.length) return
    markVisibleRead()
    const route = lastJump.current
    if (cur[cur.length - 1].n === lastN && sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80) {
      positions.set(posKey, { bottom: true, route })
      return
    }
    const t = l.topRow(true)
    const id = t && firstMessageId(rowAt(t.key))
    if (t && id != null) positions.set(posKey, { id, offset: t.offset, route })
  }, [markVisibleRead, lastN, posKey])

  const persistTimer = useRef<number | undefined>(undefined)
  const dayTimer = useRef(0)
  const onScroll = useCallback(() => {
    noteScroll()
    window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(persistPos, 250)
    // 日期浮标不必每帧更新
    if (dayTimer.current) return
    dayTimer.current = window.setTimeout(() => {
      dayTimer.current = 0
      // 同官方：自己滚回到跳转前的那条消息，这个返回点就用掉了
      const src = returnRef.current.at(-1)
      const k = src != null ? live.current.anchors.get(src) : undefined
      if (k != null) {
        if (!list.current?.isVisible(itemRowKey(k))) sourceAway.current = true
        else if (sourceAway.current) setReturnStack((st) => st.slice(0, -1))
      }
      const date = firstMessageDate(rowAt(list.current?.topRow(false)?.key))
      setTopDay(date != null ? dayLabel(date) : null)
    }, 120)
  }, [persistPos])

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && persistPos()
    window.addEventListener('pagehide', persistPos)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', persistPos)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [persistPos])

  useLayoutEffect(
    () => () => {
      window.clearTimeout(persistTimer.current)
      persistPos()
    },
    [persistPos],
  )

  const toBottom = () => {
    setReturnStack([])
    lastJump.current = undefined
    navigate(paths.chat(chatKey), { replace: true })
    if (hi === lastN && list.current) list.current.toBottom(true)
    else void openAt({ kind: 'bottom' })
  }

  // 看图
  const photos: LightboxItem[] = useMemo(
    () => messages.filter((m) => m.media?.type === 'photo' && m.media.file).map((m) => ({ msg: m, name: userName(users, m.from) })),
    [messages, users],
  )
  const onOpenPhoto = useCallback((id: number) => setViewer(photos.findIndex((p) => p.msg.id === id)), [photos])

  // 处理函数经 ref 转发，保持引用稳定，列表增删消息时已渲染的气泡不必重渲染
  const fns = useRef({ jumpFrom, onOpenPhoto })
  fns.current = { jumpFrom, onOpenPhoto }
  const handlers: ItemHandlers = useMemo(
    () => ({
      onJump: (id: number, source?: number) => void fns.current.jumpFrom(id, source),
      onOpenPhoto: (id: number) => fns.current.onOpenPhoto(id),
      onHashtag: (tag: string) => navigate(paths.search(chatKey, tag)),
      // 多选时长按也只是勾选
      onContext: (msg: Message, el: HTMLElement) => (selectingRef.current ? undefined : setMenu({ msg, el })),
      onProfile: setProfile,
      onReplies: setThread,
    }),
    [chatKey],
  )

  const closeMenu = useCallback(() => setMenu(null), [])
  const setSelection = (next: Set<number> | null) => setSelected(next)

  /** 多选复制/分享的文字，格式同官方：名字, [日期 时间] + 内容，按时间排序 */
  const selectionText = () => {
    if (!selected) return ''
    const byKey = new Map<number, Message[]>()
    for (const d of days) for (const it of d.items) if (it.kind === 'msg' && selected.has(it.key)) byKey.set(it.key, it.msgs)
    return [...byKey.keys()]
      .sort((a, b) => a - b)
      .map((k) => {
        const msgs = byKey.get(k)!
        const m = msgs.find((x) => x.text) ?? msgs[0]
        const body = [msgs.map(mediaLabel).filter(Boolean).join(' '), m.text].filter(Boolean).join('\n')
        return `${userName(users, m.from)}, [${fullDate(m.date)}]\n${body}`
      })
      .join('\n\n')
  }
  const menuGroups = menu
    ? messageMenu(menu.msg, {
        meta,
        users,
        messages,
        replies: replyIdx?.get(menu.msg.id)?.length,
        itemKey: anchors.get(menu.msg.id) ?? menu.msg.id,
        onSelect: (key) => setSelection(new Set([key])),
        onThread: setThread,
        onJump: (id, source) => void jumpFrom(id, source),
        onProfile: setProfile,
        onSearchFrom: (id) => navigate(paths.search(chatKey, '', id)),
      })
    : []

  const [calendarDate, setCalendarDate] = useState<number>()
  const openCalendar = useCallback(() => {
    setCalendarDate(firstMessageDate(rowAt(list.current?.topRow(true)?.key)))
    setCalendar(true)
  }, [])

  const onStartReached = useCallback(() => void loadMore('up'), [loadMore])
  const onEndReached = useCallback(() => void loadMore('down'), [loadMore])
  const initialPlace = useMemo(() => placeOf(gen.target), [gen, placeOf])
  const bottomPad = nav ? 'calc(var(--safe-bottom) + 76px)' : 'calc(var(--safe-bottom) + 12px)'

  const onInitialDone = useCallback(() => {
    const t = gen.target
    if (t.kind === 'msg' && t.flash && initialPlace !== 'bottom') flash(Number(initialPlace.key.slice(1)))
    onScroll()
  }, [gen, initialPlace, flash, onScroll])

  const subtitle = `${count(meta.count ?? 0)} 条消息`

  return (
    <div ref={pageRoot} className="chat-bg relative h-full overflow-hidden" style={{ '--pinned-h': pinnedShown ? '52px' : '0px' } as React.CSSProperties}>
      <div ref={safeBottom} aria-hidden className="pointer-events-none invisible absolute bottom-0 h-[var(--safe-bottom)] w-px" />
      <div ref={header} className={selecting ? 'pointer-events-none opacity-0' : undefined}>
        <NavBar
          back={meta.forum ? { label: '话题', onClick: () => goBack(paths.chat(chatKey)) } : { label: '群聊', onClick: () => goBack('/') }}
          title={topicInfo ? topicInfo.title : meta.title}
          subtitle={topicInfo ? meta.title : subtitle}
          titleIcon={<Avatar id={meta.id} name={meta.title} src={meta.avatar} size={36} className="max-[359px]:hidden" />}
          onTitleClick={() => navigate(paths.info(chatKey))}
          right={
            <>
              <NavButton label="搜索" onClick={() => navigate(lastSearchPath(chatKey, meta.id))}>
                <Search />
              </NavButton>
              <NavButton label="跳转到日期" onClick={openCalendar}>
                <Calendar />
              </NavButton>
            </>
          }
        />
      </div>
      <PinnedBar meta={meta} users={users} handlers={handlers} onJump={(id) => void jumpFrom(id)} onShown={setPinnedShown} />

      {error && !loaded.length ? (
        <div className="absolute inset-0 pt-[calc(var(--safe-top)+var(--nav-h))]">
          <ErrorState error={error} retry={() => void openAt(gen.target)} />
        </div>
      ) : !chunks.length ? (
        <div className="absolute inset-0 pt-[calc(var(--safe-top)+var(--nav-h))]">
          <CenterState>暂无消息</CenterState>
        </div>
      ) : !loaded.length ? (
        <div className="absolute inset-0 pt-[calc(var(--safe-top)+var(--nav-h))]">
          <CenterState>
            <Spinner />
          </CenterState>
        </div>
      ) : (
        <MessageList
          key={gen.id}
          ref={list}
          rows={rows}
          index={index}
          initial={initialPlace}
          clearance={clearance}
          bottomPad={bottomPad}
          users={users}
          chatId={meta.id}
          highlight={highlight}
          selected={selected}
          replyIdx={replyIdx}
          handlers={handlers}
          onToggleSelect={toggleSelect}
          onDayTap={openCalendar}
          moreAbove={lo > 0}
          moreBelow={hi < lastN}
          firstDate={meta.firstDate}
          onStartReached={onStartReached}
          onEndReached={onEndReached}
          onAtBottom={setBottomState}
          onScroll={onScroll}
          onInitialDone={onInitialDone}
        />
      )}
      {topDay != null && !selecting && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--safe-top)+var(--nav-h)+var(--player-h)+var(--pinned-h)+6px)] z-10 flex justify-center">
          <button onClick={openCalendar} data-press className="hit glass-lite glass-press pointer-events-auto rounded-full px-3 py-1 text-[13px] font-medium text-label">
            {topDay}
          </button>
        </div>
      )}

      {selecting && (
        <SelectBars
          count={selected.size}
          onCancel={() => setSelection(null)}
          onAll={() => setSelected(new Set(days.flatMap((d) => d.items.filter((i) => i.kind === 'msg').map((i) => i.key))))}
          onCopy={() => {
            void copyText(selectionText(), `已复制 ${selected.size} 条消息`)
            setSelection(null)
          }}
          onShare={() => {
            void shareText(selectionText(), undefined, meta.title)
            setSelection(null)
          }}
        />
      )}
      {nav && !selecting && <SearchNavBar nav={nav} msgId={msgId} current={() => lastJump.current} onGo={go} />}

      <button
        onClick={backTo != null ? goBackToSource : toBottom}
        aria-label={backTo != null ? '返回之前的消息' : '回到最新消息'}
        title={backTo != null ? '返回之前的消息' : '回到最新消息'}
        data-press className={`glass glass-press absolute right-3 bottom-[calc(var(--safe-bottom)+16px)] z-20 flex h-12 w-12 items-center justify-center rounded-full ${backTo != null ? 'text-accent' : 'text-label'} ${(atBottom && backTo == null) || selecting ? 'pointer-events-none scale-50 opacity-0' : 'opacity-100'}`}
        style={{ transition: 'scale 0.6s var(--spring-bouncy), transform 0.6s var(--spring-bouncy), opacity 0.25s ease-out, color 0.3s' }}
      >
        <ChevronDown size={24} />
        {backTo == null && unread > 0 && (
          <span className="absolute -top-1.5 left-1/2 min-w-[20px] -translate-x-1/2 rounded-full bg-accent px-1.5 text-center text-[12px] leading-[20px] font-semibold text-white tabular-nums">{unread > 999 ? '999+' : unread}</span>
        )}
        {returnStack.length > 1 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] rounded-full bg-accent px-1 text-center text-[11px] leading-[18px] font-semibold text-white">{returnStack.length}</span>
        )}
      </button>

      <CalendarSheet open={calendar} onClose={() => setCalendar(false)} days={meta.days} firstDate={meta.firstDate} lastDate={meta.lastDate} current={calendarDate} onPick={go} />
      <ContextMenu target={menu?.el ?? null} groups={menuGroups} onClose={closeMenu} />
      <ProfileSheet
        id={profile}
        users={users}
        meta={meta}
        onClose={() => setProfile(null)}
        onChatInfo={() => {
          setProfile(null)
          navigate(paths.info(chatKey))
        }}
        {...profileLinks(chatKey, () => setProfile(null))}
      />
      <ThreadSheet meta={meta} users={users} index={replyIdx} root={thread} onClose={() => setThread(null)} onJump={(id) => void jumpFrom(id, thread ?? undefined)} handlers={handlers} />
      {viewer != null && viewer >= 0 && <Suspense fallback={null}><Lightbox items={photos} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} /></Suspense>}
    </div>
  )
}
