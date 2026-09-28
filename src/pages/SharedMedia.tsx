import { Tabs } from 'radix-ui'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { LightboxItem } from '../chat/Lightbox'
import { Lightbox } from '../lazy'
import { VoicePlayer } from '../chat/VoicePlayer'
import { Download, FileIcon, Link as LinkIcon, Play } from '../components/Icons'
import { NavBar } from '../components/NavBar'
import { CenterState, LoadState, Spinner } from '../components/States'
import { dataUrl } from '../lib/api'
import { duration, fileSize, shortDate } from '../lib/format'
import { goBack, navigate, paths } from '../lib/router'
import { scanChat } from '../lib/scan'
import { useDocumentTitle } from '../lib/theme'
import { userName } from '../lib/text'
import type { ChatMeta, Message, Users } from '../lib/types'
import { useChat } from '../lib/useChat'

const TABS: { key: string; label: string; test: (m: Message) => boolean }[] = [
  { key: 'media', label: '媒体', test: (m) => m.media?.type === 'photo' || m.media?.type === 'video' },
  { key: 'file', label: '文件', test: (m) => m.media?.type === 'file' || m.media?.type === 'audio' },
  { key: 'link', label: '链接', test: (m) => !!linkOf(m) },
  { key: 'voice', label: '语音', test: (m) => m.media?.type === 'voice' || m.media?.type === 'round' },
  { key: 'gif', label: 'GIF', test: (m) => m.media?.type === 'gif' },
]

function linkOf(m: Message): { url: string; title?: string; site?: string } | null {
  if (m.media?.type === 'webpage' && m.media.url) return { url: m.media.url, title: m.media.title, site: m.media.site }
  for (const e of m.ents ?? []) {
    if (e[0] === 'a' && typeof e[3] === 'string') return { url: e[3] }
    if (e[0] === 'url' && m.text) return { url: m.text.slice(e[1], e[1] + e[2]) }
  }
  return null
}

const hostOf = (u: string) => {
  try {
    return new URL(/^[a-z]+:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

const safeHref = (u: string) => {
  const url = /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`
  return /^https?:/i.test(url) ? url : undefined
}

const monthOf = (ts: number) => {
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

const results = new Map<string, { list: Message[]; done: boolean }>()
const PAGE = 45

function useShared(meta: ChatMeta | undefined, tab: string, from?: number) {
  const key = meta ? `${meta.id}|${tab}|${from ?? ''}` : ''
  const [state, setState] = useState(() => ({ key, ...(results.get(key) ?? { list: [] as Message[], done: false }) }))
  useEffect(() => {
    if (!meta) return
    const cached = results.get(key)
    if (cached?.done) {
      setState({ key, ...cached })
      return
    }
    setState({ key, list: [], done: false })
    const test = TABS.find((t) => t.key === tab)?.test ?? TABS[0].test
    let alive = true
    const list: Message[] = []
    void scanChat(
      meta,
      (m) => {
        if (!m.svc && (from == null || m.from === from) && test(m)) list.push(m)
      },
      { alive: () => alive, onProgress: () => setState({ key, list: list.slice(), done: false }) },
    ).then((done) => {
      if (!alive || !done) return
      const r = { list, done: true }
      results.set(key, r)
      setState({ key, list: list.slice(), done: true })
    })
    return () => {
      alive = false
    }
  }, [meta, key, tab, from])
  return state.key === key ? state : { key, list: [] as Message[], done: false }
}

export function SharedMediaPage({ chatKey, type, from }: { chatKey: string; type?: string; from?: number }) {
  const { chat: ready, error: loadError, retry } = useChat(chatKey)
  const meta = ready?.meta
  const users: Users = ready?.users ?? {}
  const tab = TABS.some((t) => t.key === type) ? type! : 'media'
  const who = from != null ? userName(users, from) : ''
  useDocumentTitle(meta ? `${who ? `${who} 的媒体` : '共享媒体'} · ${meta.title}` : '共享媒体')
  const { list, done } = useShared(meta, tab, from)
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [tab])
  const [viewer, setViewer] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const visual = useMemo(() => list.filter((m) => m.media?.file), [list])
  const lightItems: LightboxItem[] = useMemo(() => visual.map((m) => ({ msg: m, name: userName(users, m.from) })), [visual, users])
  const setTab = (k: string) => navigate(paths.media(chatKey, k === 'media' ? undefined : k, from), { replace: true })
  const showInChat = (id: number) => navigate(paths.chat(chatKey, id))

  const idx = TABS.findIndex((t) => t.key === tab)
  const items = list.slice(0, shown)
  const groups: { month: string; items: Message[] }[] = []
  for (const m of items) {
    const month = monthOf(m.date)
    if (groups.at(-1)?.month !== month) groups.push({ month, items: [] })
    groups.at(-1)!.items.push(m)
  }

  return (
    <div className="relative h-full bg-bg">
      <NavBar back={{ label: '返回', onClick: () => goBack(paths.info(chatKey)) }} title={who ? `${who} 的媒体` : '共享媒体'} subtitle={meta?.title} />
      <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--safe-top)+var(--nav-h)+var(--player-h))] z-20 mx-auto max-w-3xl px-3 pt-1">
        <Tabs.Root value={tab} onValueChange={setTab} activationMode="automatic">
          <Tabs.List aria-label="媒体类型" className="glass pointer-events-auto relative flex rounded-full p-[3px]">
            <div
              aria-hidden
              className="absolute top-[3px] bottom-[3px] left-[3px] rounded-full bg-accent transition-transform duration-500 ease-[var(--spring-snappy)]"
              style={{ width: `calc((100% - 6px) / ${TABS.length})`, transform: `translateX(${idx * 100}%)` }}
            />
            {TABS.map((t) => (
              <Tabs.Trigger
                key={t.key}
                value={t.key}
                className="relative h-8 flex-1 rounded-full text-[14px] font-medium text-label transition-colors duration-300 data-[state=active]:text-white"
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          if (shown < list.length && el.scrollTop + el.clientHeight > el.scrollHeight - 1200) setShown((n) => n + PAGE)
        }}
        className="scroller absolute inset-0 pt-[calc(var(--safe-top)+var(--nav-h)+var(--player-h)+48px)] pb-[calc(var(--safe-bottom)+24px)]"
      >
        <div className="mx-auto max-w-3xl">
          {!ready && <LoadState error={loadError} retry={retry} />}
          {meta && done && !list.length && (
            <CenterState>
              <div className="text-[17px] text-label">没有{TABS[idx].label}</div>
              <div className="text-[14px]">{who ? `${who} ` : '这个群'}还没有发过{TABS[idx].label}</div>
            </CenterState>
          )}
          {groups.map((g) => (
            <section key={g.month}>
              <div className="px-4 pt-3 pb-1.5 text-[13px] font-semibold text-label2">{g.month}</div>
              {tab === 'media' || tab === 'gif' ? (
                <div className="grid grid-cols-3 gap-[2px] sm:grid-cols-4">
                  {g.items.map((m) => (
                    <Tile key={m.id} m={m} onOpen={() => (m.media?.file ? setViewer(visual.indexOf(m)) : showInChat(m.id))} />
                  ))}
                </div>
              ) : (
                <ul className="mx-3 overflow-hidden rounded-[var(--r-card)] bg-cell">
                  {g.items.map((m, i) => (
                    <li key={m.id} className={i < g.items.length - 1 ? 'hairline-b' : ''}>
                      {tab === 'file' ? (
                        <FileRow m={m} onShow={() => showInChat(m.id)} />
                      ) : tab === 'link' ? (
                        <LinkRow m={m} onShow={() => showInChat(m.id)} />
                      ) : (
                        <VoiceRow m={m} meta={meta!} name={userName(users, m.from)} onShow={() => showInChat(m.id)} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {meta && !done && (
            <div className="flex h-16 items-center justify-center">
              <Spinner />
            </div>
          )}
        </div>
      </div>
      {viewer != null && viewer >= 0 && <Suspense fallback={null}><Lightbox items={lightItems} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} onShowInChat={showInChat} /></Suspense>}
    </div>
  )
}

function Tile({ m, onOpen }: { m: Message; onOpen: () => void }) {
  const md = m.media!
  const img = md.type === 'photo' ? (md.file ?? md.thumb) : md.thumb
  return (
    <button type="button" data-press style={{ '--press': 0.96 } as React.CSSProperties} onClick={onOpen} className="relative aspect-square overflow-hidden bg-fill2" aria-label={md.type === 'photo' ? '查看图片' : '播放视频'}>
      {img ? (
        <img src={dataUrl(img)} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-label3">{md.type === 'photo' ? '图片' : <Play size={26} />}</span>
      )}
      {md.type !== 'photo' && (
        <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 text-[11px] font-medium text-white tabular-nums">{md.type === 'gif' ? 'GIF' : duration(md.dur) || '视频'}</span>
      )}
      {!md.file && <span className="absolute inset-0 flex items-end justify-end p-1 text-[10px] text-white/80">未存档</span>}
    </button>
  )
}

function FileRow({ m, onShow }: { m: Message; onShow: () => void }) {
  const md = m.media!
  const name = md.type === 'audio' ? [md.performer, md.title].filter(Boolean).join(' - ') || md.name || '音频' : md.name || '文件'
  const ext = (md.name?.split('.').pop() ?? '').slice(0, 4).toUpperCase()
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {md.file ? (
        <a href={dataUrl(md.file)} download={md.name} target="_blank" rel="noopener" data-press className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-accent text-[11px] font-bold text-white" aria-label="下载">
          {ext || <Download size={20} />}
        </a>
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-fill2 text-label2">
          <FileIcon size={20} />
        </span>
      )}
      <button type="button" onClick={onShow} className="min-w-0 flex-1 text-left">
        <div className="truncate text-[16px] text-label">{name}</div>
        <div className="text-[13px] text-label2">
          {[fileSize(md.size), shortDate(m.date)].filter(Boolean).join(' · ')}
          {!md.file && ' · 未存档'}
        </div>
      </button>
    </div>
  )
}

function LinkRow({ m, onShow }: { m: Message; onShow: () => void }) {
  const l = linkOf(m)!
  const host = hostOf(l.url)
  const href = safeHref(l.url)
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-accent/15 text-[18px] font-semibold text-accent uppercase">{host[0] ?? <LinkIcon size={20} />}</span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onShow} className="block w-full min-w-0 text-left">
          <div className="truncate text-[16px] font-medium text-label">{l.title || l.site || host}</div>
          {m.text && <div className="line-clamp-2 text-[14px] leading-snug text-label2">{m.text}</div>}
        </button>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-[14px] text-accent">
            {l.url}
          </a>
        ) : (
          <div className="truncate text-[14px] text-label2">{l.url}</div>
        )}
      </div>
    </div>
  )
}

function VoiceRow({ m, meta, name, onShow }: { m: Message; meta: ChatMeta; name: string; onShow: () => void }) {
  const md = m.media!
  if (md.type === 'round') {
    return (
      <button type="button" onClick={onShow} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <Play size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] text-label">视频消息 · {name}</span>
          <span className="block text-[13px] text-label2">{[duration(md.dur), shortDate(m.date)].filter(Boolean).join(' · ')}</span>
        </span>
      </button>
    )
  }
  return (
    <div className="px-3 py-2">
      <button type="button" onClick={onShow} className="mb-0.5 flex w-full items-baseline gap-2 text-left">
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-label">{name}</span>
        <span className="shrink-0 text-[12px] text-label2">{shortDate(m.date)}</span>
      </button>
      <VoicePlayer msg={m} media={md} chatId={meta.id} chatKey={String(meta.id)} name={name} />
    </div>
  )
}
