import { useEffect, useMemo, useState } from 'react'
import { ListIcon } from '../components/Icons'
import { getMessage } from '../lib/api'
import { afterTransition } from '../lib/idle'
import { scanChat } from '../lib/scan'
import { previewOf } from '../lib/text'
import type { ChatMeta, Message, Users } from '../lib/types'
import type { ItemHandlers } from './MessageItem'
import { PinnedView } from './PinnedView'

/** 旧存档没有 meta.pins：空闲时从“置顶了消息”的服务消息推算（新 → 旧，去重） */
const derived = new Map<number, number[]>()

function usePins(meta: ChatMeta): number[] {
  const [all, setPins] = useState<number[]>(() => meta.pins ?? derived.get(meta.id) ?? [])
  // meta.pins 是频道当前的置顶（抓取时从 Telegram 取），可能比存档新：只留存档范围内的
  const pins = useMemo(() => all.filter((id) => (meta.firstId == null || id >= meta.firstId) && (meta.lastId == null || id <= meta.lastId)), [all, meta.firstId, meta.lastId])
  useEffect(() => {
    if (meta.pins || derived.has(meta.id)) return
    let alive = true
    const cancel = afterTransition(() => {
      const found: number[] = []
      void scanChat(
        meta,
        (m) => {
          if (m.svc?.type === 'pin' && m.reply && !found.includes(m.reply.id)) found.push(m.reply.id)
          if (found.length >= 20) return false
        },
        { alive: () => alive },
      ).then((done) => {
        if (!done) return
        derived.set(meta.id, found)
        if (alive) setPins(found)
      })
    }, 1500)
    return () => {
      alive = false
      cancel()
    }
  }, [meta])
  return pins
}

/** 加载这几条置顶；存档里找不到的（已删除）记为 null */
function usePinnedMessages(meta: ChatMeta, ids: number[]): Map<number, Message | null> {
  const [map, setMap] = useState(() => new Map<number, Message | null>())
  useEffect(() => {
    let alive = true
    // 置顶消息可能分散在别的块里：转场结束后再加载，不和打开聊天抢主线程
    const cancel = afterTransition(
      () =>
        void Promise.all(ids.map((id) => getMessage(meta.id, meta.chunks, id).catch(() => undefined))).then((list) => {
          if (!alive) return
          setMap((prev) => {
            const m = new Map(prev)
            ids.forEach((id, k) => m.set(id, list[k] ?? null))
            return m
          })
        }),
    )
    return () => {
      alive = false
      cancel()
    }
  }, [meta, ids])
  return map
}

/**
 * 置顶消息横幅（同官方）：导航栏下方，点按跳到当前这条并轮到下一条（更早的）置顶；
 * 左侧分段指示当前是第几条，右侧按钮打开全部置顶列表。
 */
export function PinnedBar({
  meta,
  users,
  handlers,
  onJump,
  onShown,
}: {
  meta: ChatMeta
  users: Users
  handlers: ItemHandlers
  onJump: (id: number) => void
  /** 横幅显示与否，聊天页据此给内容和日期胶囊让位 */
  onShown: (shown: boolean) => void
}) {
  const inRange = usePins(meta)
  // 范围内但存档里没有的（被删除的）置顶，加载后发现就去掉
  const [gone, setGone] = useState<ReadonlySet<number>>(() => new Set())
  const pins = useMemo(() => (gone.size ? inRange.filter((id) => !gone.has(id)) : inRange), [inRange, gone])
  const [i, setI] = useState(0)
  const cur = Math.min(i, Math.max(0, pins.length - 1))
  const near = useMemo(() => (pins.length ? [pins[cur], pins[(cur + 1) % pins.length]] : []), [pins, cur])
  const msgs = usePinnedMessages(meta, near)
  const [list, setList] = useState(false)
  useEffect(() => {
    const missing = near.filter((id) => msgs.get(id) === null)
    if (missing.length) setGone((g) => new Set([...g, ...missing]))
  }, [near, msgs])
  useEffect(() => {
    onShown(pins.length > 0)
  }, [pins.length, onShown])
  useEffect(() => () => onShown(false), [onShown])
  if (!pins.length) return null
  const idx = Math.min(i, pins.length - 1)
  const id = pins[idx]
  const m = msgs.get(id)
  const n = pins.length
  const seg = Math.min(n, 4)
  // 指示条：最多 4 段，超过时窗口跟随当前位置
  const segStart = Math.min(Math.max(0, idx - 1), n - seg)
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--safe-top)+var(--nav-h)+var(--player-h)+4px)] z-20 mx-auto max-w-3xl px-3">
        <div className="glass pointer-events-auto flex h-12 animate-pop items-center rounded-[20px] pr-1 pl-3">
          <button
            type="button"
            data-press
            style={{ '--press': 1.03 } as React.CSSProperties}
            onClick={() => {
              onJump(id)
              setI((idx + 1) % n)
            }}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            aria-label={`置顶消息 ${idx + 1}/${n}，点按跳转`}
          >
            <span className="flex h-9 w-[3px] shrink-0 flex-col gap-[2px]" aria-hidden>
              {Array.from({ length: seg }, (_, k) => (
                <span key={k} className={`min-h-0 flex-1 rounded-full transition-colors duration-300 ${segStart + k === idx ? 'bg-accent' : 'bg-accent/30'}`} />
              ))}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[13px] font-semibold text-accent">置顶消息{n > 1 ? ` #${n - idx}` : ''}</span>
              <span key={id} className="block animate-fade truncate text-[14px] text-label">{m ? previewOf(m, users) || '[消息]' : '…'}</span>
            </span>
          </button>
          {n > 1 && (
            <button type="button" data-press onClick={() => setList(true)} aria-label="全部置顶消息" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-label2">
              <ListIcon size={20} />
            </button>
          )}
        </div>
      </div>
      <PinnedView
        open={list}
        meta={meta}
        users={users}
        pins={pins}
        handlers={handlers}
        onClose={() => setList(false)}
        onGo={(pid) => {
          setList(false)
          const k = pins.indexOf(pid)
          if (k >= 0) setI(k)
          onJump(pid)
        }}
      />
    </>
  )
}
