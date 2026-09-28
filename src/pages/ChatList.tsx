import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCheck, ChartColumn, Gauge, Globe, ImagePlay, Info, MessagesSquare, Pin, PinOff, RefreshCw, Sticker, Video } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import PullToRefresh from 'react-simple-pull-to-refresh'
import { Avatar } from '../components/Avatar'
import { Archive, ChevronRight, Gear } from '../components/Icons'
import { NavBar, NavButton } from '../components/NavBar'
import { SearchField } from '../components/SearchField'
import { Sheet } from '../components/Sheet'
import { CenterState, ErrorState, Spinner } from '../components/States'
import { ContextMenu, type MenuAction } from '../components/ContextMenu'
import { jsonQuery, prefetchChat } from '../lib/api'
import { count, relative, shortDate } from '../lib/format'
import { useQuery } from '@tanstack/react-query'
import { useDrag } from '@use-gesture/react'
import { useLongPress } from '../lib/longPress'
import { navigate, paths } from '../lib/router'
import { blurActiveInput, isTouchScreen, standalone } from '../lib/viewport'
import { serviceText } from '../lib/text'
import { setGlassTint, setTheme, useDocumentTitle, useGlassTint, useTheme, type ThemePref } from '../lib/theme'
import type { ChatSummary, SiteIndex } from '../lib/types'
import { FONT_SIZES, WALLPAPERS, getPrefs, setPrefs, usePrefs } from '../lib/prefs'
import { markRead, unreadOf, useReadState } from '../lib/readState'
import { Switch } from '../components/Switch'
import { GlassSlider } from '../components/GlassSlider'
import { RadioGroup, ToggleGroup } from 'radix-ui'
import { Card, IconBadge, Row, SectionHeader } from '../components/List'
import { afterTransition } from '../lib/idle'
import { queryClient } from '../lib/queryClient'

let savedScroll = 0

type Filter = 'all' | 'unread' | 'pinned'
const SPRING = { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 } as const
const MIN_REFRESH_MS = 700

const chatKey = (c: ChatSummary) => c.username ?? String(c.id)

function togglePin(id: number) {
  const list = getPrefs().pinnedChats
  setPrefs({ pinnedChats: list.includes(id) ? list.filter((x) => x !== id) : [id, ...list] })
}

function readAll(chat: ChatSummary) {
  if (chat.last) markRead(chat.id, { id: chat.last.id, n: chat.count ?? 0 }, true)
}

type Handlers = Record<string, unknown>

function mergeHandlers(...all: Handlers[]): React.HTMLAttributes<HTMLElement> {
  const out: Handlers = {}
  for (const h of all)
    for (const [k, v] of Object.entries(h)) {
      const prev = out[k]
      out[k] =
        typeof prev === 'function' && typeof v === 'function'
          ? (e: unknown) => {
              ;(prev as (e: unknown) => void)(e)
              ;(v as (e: unknown) => void)(e)
            }
          : v
    }
  return out as React.HTMLAttributes<HTMLElement>
}

function chatMenu(chat: ChatSummary, pinned: boolean, unread: number): MenuAction[][] {
  const key = chatKey(chat)
  return [
    [
      { label: pinned ? '取消置顶' : '置顶', icon: pinned ? <PinOff size={20} /> : <Pin size={20} />, onClick: () => togglePin(chat.id) },
      ...(unread ? [{ label: '标为已读', icon: <CheckCheck size={20} />, onClick: () => readAll(chat) }] : []),
    ],
    [
      { label: '群资料', icon: <Info size={20} />, onClick: () => navigate(paths.info(key)) },
      { label: '发言统计', icon: <ChartColumn size={20} />, onClick: () => navigate(paths.stats(key)) },
    ],
  ]
}

type OpenMenu = (chat: ChatSummary, el: HTMLElement) => void

export function ChatListPage() {
  const data = useQuery(jsonQuery<SiteIndex>('index.json'))
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [scrolled, setScrolled] = useState(false)
  const [settings, setSettings] = useState(false)
  const [menu, setMenu] = useState<{ chat: ChatSummary; el: HTMLElement } | null>(null)
  const openMenu = useCallback<OpenMenu>((chat, el) => setMenu({ chat, el }), [])
  const closeMenu = useCallback(() => setMenu(null), [])
  const scroller = useRef<HTMLDivElement>(null)
  const index = data.data
  const title = index?.title ?? '群聊存档'
  useDocumentTitle(title)

  useLayoutEffect(() => {
    if (index && scroller.current) scroller.current.scrollTop = savedScroll
  }, [index])

  const onScroll = () => {
    const top = scroller.current?.scrollTop ?? 0
    savedScroll = top
    setScrolled(top > 40)
  }

  const prefs = usePrefs()
  useReadState()
  const needle = q.trim().toLowerCase()
  const matched = index?.chats.filter((c) => !needle || c.title.toLowerCase().includes(needle) || c.username?.toLowerCase().includes(needle)) ?? []
  const pinRank = (id: number) => {
    const i = prefs.pinnedChats.indexOf(id)
    return i < 0 ? Infinity : i
  }
  const sorted = [...matched].sort((a, b) => pinRank(a.id) - pinRank(b.id) || 0)
  const isPinned = (c: ChatSummary) => prefs.pinnedChats.includes(c.id)
  const unreadTotal = matched.filter((c) => unreadOf(c.id, c.count) > 0).length
  const grid = !needle && filter === 'all' ? sorted.filter(isPinned) : []
  const rows = sorted.filter((c) => !grid.includes(c) && (filter !== 'unread' || unreadOf(c.id, c.count) > 0) && (filter !== 'pinned' || isPinned(c)))
  const firstIds = sorted.slice(0, 3).map((c) => c.id).join(',')
  useEffect(() => {
    if (!firstIds) return
    return afterTransition(() => firstIds.split(',').forEach((id) => prefetchChat(Number(id))), 2000)
  }, [firstIds])

  const refresh = useCallback(async () => {
    const started = Date.now()
    await queryClient.invalidateQueries({ queryKey: ['archive'], refetchType: 'none' })
    await data.refetch()
    await new Promise((r) => setTimeout(r, Math.max(0, MIN_REFRESH_MS - (Date.now() - started))))
  }, [data])
  const menuGroups = menu ? chatMenu(menu.chat, isPinned(menu.chat), unreadOf(menu.chat.id, menu.chat.count)) : []

  return (
    <div className="relative h-full bg-bg">
      <NavBar
        title={title}
        titleVisible={scrolled}
        transparentUntilScroll
        scrolled={scrolled}
        right={
          <NavButton label="设置" onClick={() => setSettings(true)}>
            <Gear />
          </NavButton>
        }
      />
      <PullToRefresh
        onRefresh={refresh}
        isPullable={isTouchScreen()}
        pullDownThreshold={64}
        maxPullDownDistance={110}
        resistance={2}
        className="list-ptr absolute! inset-0"
        pullingContent={<ActivityIndicator />}
        refreshingContent={<ActivityIndicator spinning />}
      >
        <div
          ref={scroller}
          onScroll={onScroll}
          onTouchMove={blurActiveInput}
          className="scroller absolute inset-0 overscroll-y-none pt-[calc(var(--safe-top)+var(--nav-h)+var(--player-h))] pb-[calc(var(--safe-bottom)+var(--kb)+16px)]"
        >
          <div className="mx-auto max-w-3xl">
            <h1 className="px-4 pt-0.5 pb-2 text-[34px] leading-[41px] font-bold tracking-tight">{title}</h1>
            <div className="px-4 pb-3">
              <SearchField value={q} onChange={setQ} placeholder="搜索群聊" />
            </div>
            {data.isPending && (
              <CenterState>
                <Spinner />
              </CenterState>
            )}
            {data.isError && <ErrorState error={data.error} retry={() => void data.refetch()} />}
            {index && (
              <>
                {index.chats.length > 0 && <Filters value={filter} onChange={setFilter} unread={unreadTotal} pinned={matched.filter(isPinned).length} />}
                {grid.length > 0 && <PinnedGrid chats={grid} onMenu={openMenu} />}
                {rows.length === 0 && grid.length === 0 ? (
                  <CenterState>
                    <Archive size={40} className="text-label3" />
                    {needle ? '没有匹配的群聊' : filter === 'unread' ? '没有未读消息' : filter === 'pinned' ? '还没有置顶的群聊，左滑或长按群聊即可置顶' : '还没有存档任何群聊'}
                  </CenterState>
                ) : (
                  <ul className="px-2">
                    <AnimatePresence initial={false}>
                      {rows.map((c) => (
                        <ChatRow key={c.id} chat={c} pinned={isPinned(c)} unread={unreadOf(c.id, c.count)} onMenu={openMenu} menuOpen={!!menu} />
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
                <Footer index={index} />
              </>
            )}
          </div>
        </div>
      </PullToRefresh>
      <ContextMenu target={menu?.el ?? null} groups={menuGroups} onClose={closeMenu} />
      <SettingsSheet open={settings} onClose={() => setSettings(false)} index={index} />
    </div>
  )
}

function ActivityIndicator({ spinning }: { spinning?: boolean }) {
  return (
    <span className={`ios-spinner text-label2 ${spinning ? 'is-spinning' : ''}`} role="progressbar" aria-label={spinning ? '正在刷新' : '下拉刷新'}>
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ transform: `rotate(${i * 45}deg)`, opacity: 1 - i * 0.1 }} />
      ))}
    </span>
  )
}

const FILTERS: { v: Filter; label: string }[] = [
  { v: 'all', label: '全部' },
  { v: 'unread', label: '未读' },
  { v: 'pinned', label: '置顶' },
]

function Filters({ value, onChange, unread, pinned }: { value: Filter; onChange: (f: Filter) => void; unread: number; pinned: number }) {
  const n = { all: 0, unread, pinned }
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as Filter)}
      aria-label="筛选群聊"
      className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3"
    >
      {FILTERS.map((f) => (
        <ToggleGroup.Item
          key={f.v}
          value={f.v}
          data-press
          className="glass-press flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[14px] font-medium text-label transition-colors duration-300 data-[state=on]:bg-accent data-[state=on]:text-white"
        >
          {f.label}
          {n[f.v] > 0 && <span className="text-[13px] tabular-nums opacity-70">{n[f.v]}</span>}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

function PinnedGrid({ chats, onMenu }: { chats: ChatSummary[]; onMenu: OpenMenu }) {
  return (
    <motion.ul layout className="grid grid-cols-3 gap-y-3 px-3 pt-1 pb-4 min-[480px]:grid-cols-4">
      <AnimatePresence initial={false}>
        {chats.map((c) => {
          const unread = unreadOf(c.id, c.count)
          return (
            <motion.li key={c.id} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={SPRING}>
              <PinnedTile chat={c} unread={unread} onMenu={onMenu} />
            </motion.li>
          )
        })}
      </AnimatePresence>
    </motion.ul>
  )
}

function PinnedTile({ chat: c, unread, onMenu }: { chat: ChatSummary; unread: number; onMenu: OpenMenu }) {
  const press = useLongPress((el) => onMenu(c, el))
  return (
    <a
      href={'#' + paths.chat(chatKey(c))}
      onClick={(e) => {
        e.preventDefault()
        navigate(paths.chat(chatKey(c)))
      }}
      {...press}
      onPointerDown={() => prefetchChat(c.id)}
      data-press
      className="jump-target mx-auto flex w-fit max-w-full flex-col items-center gap-1.5 rounded-[20px] bg-bg px-1 pt-1 pb-1.5 text-label no-underline"
      style={{ '--press': 1.08 } as React.CSSProperties}
    >
      <span className="relative">
        <Avatar id={c.id} name={c.title} src={c.avatar} size={76} className="shadow-[0_6px_18px_rgb(0_0_0/0.12)]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-1 min-w-[24px] rounded-full bg-accent px-1.5 text-center text-[13px] leading-[24px] font-semibold text-white tabular-nums ring-[3px] ring-bg">
            {unread > 999 ? '999+' : unread}
          </span>
        )}
      </span>
      <span className={`max-w-full truncate px-1 text-[13px] ${unread ? 'font-semibold' : 'text-label2'}`}>{c.title}</span>
    </a>
  )
}

let closeOpenRow: (() => void) | null = null
const ACTION_W = 76
const ACTIONS_W = ACTION_W * 2 + 12

function ChatRow({ chat, pinned, unread, onMenu, menuOpen }: { chat: ChatSummary; pinned: boolean; unread: number; onMenu: OpenMenu; menuOpen: boolean }) {
  const last = chat.last
  let preview = last?.text ?? ''
  if (last?.svc) preview = serviceText(last.svc, last.name ?? '', undefined, undefined)
  const key = chatKey(chat)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const open = dx < 0
  const close = () => setDx(0)
  const setOpen = () => {
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow()
    closeOpenRow = close
    setDx(-ACTIONS_W)
  }
  const bind = useDrag(
    ({ active, offset: [ox], movement: [mx] }) => {
      if (!active && Math.abs(mx) < 3) return setDragging(false)
      setDragging(active)
      if (active) setDx(ox)
      else if (ox < -ACTIONS_W * 0.4) setOpen()
      else close()
    },
    { axis: 'x', enabled: !menuOpen, from: () => [dx, 0], bounds: { left: -ACTIONS_W, right: 0 }, rubberband: 0.3, pointer: { touch: true } },
  )
  const press = useLongPress((el) => {
    if (dx === 0) onMenu(chat, el)
  })
  const reveal = Math.min(1, -dx / ACTIONS_W)
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={SPRING}
      className="relative overflow-hidden"
    >
      <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-1" style={{ width: ACTIONS_W }} aria-hidden={!open}>
        <SwipeAction
          label={pinned ? '取消置顶' : '置顶'}
          icon={pinned ? <PinOff size={21} /> : <Pin size={21} />}
          className="bg-[#ff9500]"
          reveal={reveal}
          onClick={() => {
            togglePin(chat.id)
            close()
          }}
        />
        <SwipeAction
          label={unread ? '标为已读' : '已读'}
          icon={<CheckCheck size={21} />}
          className="bg-accent"
          reveal={reveal}
          onClick={() => {
            readAll(chat)
            close()
          }}
        />
      </div>
        <a
          href={'#' + paths.chat(key)}
          onClick={(e) => {
            e.preventDefault()
            if (open) return close()
            navigate(paths.chat(key))
          }}
          {...mergeHandlers(bind(), press)}
          onPointerDown={() => prefetchChat(chat.id)}
          data-press
          className="press-row relative flex touch-pan-y items-center gap-3 rounded-[20px] bg-bg py-2.5 pr-2 pl-2 text-label no-underline"
          style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? 'none' : 'transform 0.45s var(--spring-snappy)' }}
        >
          <Avatar id={chat.id} name={chat.title} src={chat.avatar} size={56} />
          <div className="flex min-w-0 flex-1 flex-col self-stretch justify-center">
            <div className="flex items-center gap-1.5">
              <span className={`min-w-0 flex-1 truncate text-[17px] ${unread ? 'font-bold' : 'font-semibold'}`}>{chat.title}</span>
              {pinned && <Pin size={13} className="shrink-0 rotate-45 text-label3" />}
              {chat.lastDate && <span className={`shrink-0 text-[14px] tabular-nums ${unread ? 'font-medium text-accent' : 'text-label2'}`}>{shortDate(chat.lastDate)}</span>}
              <ChevronRight size={14} className="-mr-0.5 shrink-0 text-label3" />
            </div>
            <div className="mt-0.5 flex items-start gap-2">
              <div className={`line-clamp-2 min-h-[2.5em] min-w-0 flex-1 text-[15px] leading-[1.25] ${unread ? 'text-label' : 'text-label2'}`}>
                {last?.name && !last.svc && <span className={unread ? 'font-medium' : 'text-label'}>{last.name}：</span>}
                {preview}
              </div>
              {unread > 0 && (
                <span className="mt-0.5 min-w-[22px] shrink-0 rounded-full bg-accent px-1.5 text-center text-[13px] leading-[22px] font-semibold text-white tabular-nums">
                  {unread > 9999 ? '9999+' : unread}
                </span>
              )}
            </div>
          </div>
        </a>
    </motion.li>
  )
}

function SwipeAction({ label, icon, className, reveal, onClick }: { label: string; icon: ReactNode; className: string; reveal: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-press
      className={`flex h-[64px] flex-col items-center justify-center gap-1 rounded-[20px] text-[12px] font-semibold text-white ${className}`}
      style={{ width: ACTION_W, transform: `scale(${0.7 + reveal * 0.3})`, opacity: reveal }}
    >
      {icon}
      {label}
    </button>
  )
}

function Footer({ index }: { index: SiteIndex }) {
  const total = index.chats.reduce((a, c) => a + (c.count ?? 0), 0)
  return (
    <div className="px-4 py-6 text-center text-[13px] text-label2">
      {index.chats.length} 个群聊 · {count(total)} 条消息
      {index.updatedAt ? <div>最后更新于 {relative(index.updatedAt)}</div> : null}
    </div>
  )
}

const THEMES: { v: ThemePref; label: string }[] = [
  { v: 'system', label: '跟随系统' },
  { v: 'light', label: '浅色' },
  { v: 'dark', label: '深色' },
]

function SettingsSheet({ open, onClose, index }: { open: boolean; onClose: () => void; index?: SiteIndex }) {
  const theme = useTheme()
  const tint = useGlassTint()
  const prefs = usePrefs()
  return (
    <Sheet open={open} onClose={onClose} title="设置">
      <div className="px-4 pb-6">
        <SectionHeader first>外观</SectionHeader>
        <ToggleGroup.Root
          type="single"
          value={theme}
          onValueChange={(v) => v && setTheme(v as ThemePref)}
          aria-label="外观"
          className="relative flex rounded-full bg-fill p-[3px]"
        >
          <div
            aria-hidden
            className="glass absolute top-[3px] bottom-[3px] left-[3px] w-[calc((100%-6px)/3)] rounded-full transition-transform duration-700 ease-[var(--spring-bouncy)]"
            style={{ transform: `translateX(${Math.max(0, THEMES.findIndex((t) => t.v === theme)) * 100}%)` }}
          />
          {THEMES.map((t) => (
            <ToggleGroup.Item
              key={t.v}
              value={t.v}
              className="relative h-9 flex-1 rounded-full text-[15px] font-medium text-label2 transition-colors duration-300 data-[state=on]:text-label"
            >
              {t.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <SectionHeader>玻璃效果</SectionHeader>
        <Card className="px-4 py-3">
          <div className="flex items-center gap-3 text-[14px] text-label2">
            <span className="shrink-0">通透</span>
            <GlassSlider value={tint} min={0} max={1} step={0.05} onChange={setGlassTint} label="玻璃效果：从通透到着色" />
            <span className="shrink-0">着色</span>
          </div>
        </Card>
        <p className="px-4 pt-2 text-[13px] leading-snug text-label2">调整导航栏、按钮和面板的透明程度。系统开启“降低透明度”时始终为实色。</p>
        <ChatAppearance />
        <SectionHeader>自动播放</SectionHeader>
        <Card>
          <ToggleRow icon={<IconBadge icon={ImagePlay} color="#34c759" />} label="GIF" checked={prefs.autoplayGif} onChange={(v) => setPrefs({ autoplayGif: v })} />
          <ToggleRow icon={<IconBadge icon={Video} color="#ff3b30" />} label="视频" checked={prefs.autoplayVideo} onChange={(v) => setPrefs({ autoplayVideo: v })} />
          <ToggleRow icon={<IconBadge icon={Sticker} color="#ff9500" />} label="动画贴纸" checked={prefs.autoplayStickers} onChange={(v) => setPrefs({ autoplayStickers: v })} />
        </Card>
        <SectionHeader>数据与存储</SectionHeader>
        <Card>
          <ToggleRow icon={<IconBadge icon={Gauge} color="#007aff" />} label="省流量模式" checked={prefs.dataSaver} onChange={(v) => setPrefs({ dataSaver: v })} />
        </Card>
        <p className="px-4 pt-2 text-[13px] leading-snug text-label2">开启后图片和视频不会自动加载，点按后再下载。</p>
        <SectionHeader>关于</SectionHeader>
        <Card>
          <Row leading={<IconBadge icon={MessagesSquare} color="#34c759" />} label="群聊数量" value={String(index?.chats.length ?? '-')} />
          <Row leading={<IconBadge icon={Globe} color="#5856d6" />} label="时区" value={index?.timezone ?? '-'} />
          <Row leading={<IconBadge icon={RefreshCw} color="#8e8e93" />} label="最后更新" value={index?.updatedAt ? relative(index.updatedAt) : '-'} />
        </Card>
        {!standalone && (
          <p className="px-4 pt-3 text-[13px] leading-snug text-label2">
            在 Safari 中点击“分享”→“添加到主屏幕”，即可像 App 一样离线浏览已看过的内容。
          </p>
        )}
      </div>
    </Sheet>
  )
}

function ToggleRow({ icon, label, checked, onChange }: { icon?: ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <Row leading={icon} label={label} right={<Switch checked={checked} onChange={onChange} label={label} />} />
}

const PREVIEW_LINES = ['早上好！这是字号预览 ☀️', '拖动下面的滑块调整消息文字大小']

function ChatAppearance() {
  const prefs = usePrefs()
  return (
    <>
      <SectionHeader>聊天</SectionHeader>
      <Card>
        <div className="chat-bg flex flex-col gap-1.5 px-3 py-4">
          {PREVIEW_LINES.map((line) => (
            <div key={line} className="max-w-[80%] self-start rounded-[18px] rounded-bl-[6px] bg-bubble px-2.5 py-1.5 shadow-[0_1px_1px_rgba(0,0,0,0.12)]">
              <div className="bubble-text">{line}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="shrink-0 text-[13px]">A</span>
          <GlassSlider
            value={prefs.fontStep}
            min={0}
            max={FONT_SIZES.length - 1}
            step={1}
            onChange={(v) => setPrefs({ fontStep: v })}
            label="消息字号"
            valueText={`${FONT_SIZES[prefs.fontStep]} 像素`}
          />
          <span className="shrink-0 text-[21px]">A</span>
        </div>
        <RadioGroup.Root
          value={prefs.wallpaper}
          onValueChange={(v) => setPrefs({ wallpaper: v as typeof prefs.wallpaper })}
          orientation="horizontal"
          aria-label="聊天背景"
          className="hairline-t no-scrollbar flex gap-3 overflow-x-auto px-4 py-3"
        >
          {WALLPAPERS.map((w) => {
            const on = prefs.wallpaper === w.key
            return (
              <RadioGroup.Item key={w.key} value={w.key} data-press className="flex w-[58px] shrink-0 flex-col items-center gap-1 text-[12px]">
                <span
                  className={`wp-swatch block h-[76px] w-[52px] rounded-[12px] ring-offset-2 ring-offset-cell ${on ? 'ring-2 ring-accent' : 'ring-[0.5px] ring-sep'}`}
                  style={{ '--sw-l': w.light, '--sw-d': w.dark } as React.CSSProperties}
                />
                <span className={on ? 'text-accent' : 'text-label2'}>{w.label}</span>
              </RadioGroup.Item>
            )
          })}
        </RadioGroup.Root>
      </Card>
    </>
  )
}

