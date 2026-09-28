import { Component, forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { afterTransition } from '../lib/idle'
import { flushSync } from 'react-dom'
import { Separator } from 'radix-ui'
import { Spinner } from '../components/States'
import { dayLabel, fullDate } from '../lib/format'
import type { ReplyIndex } from '../lib/replies'
import type { Users } from '../lib/types'
import type { Item } from './grouping'
import { MessageItem, type ItemHandlers } from './MessageItem'
import type { Row } from './rows'
import { SelectRow } from './SelectMode'


export interface Place {
  key: string
  align: 'center' | 'start' | 'offset'
  offset?: number
}

export interface Clearance {
  top: number
  bottom: number
}

export interface ListHandle {
  place(p: Place, opts?: { smooth?: boolean; onDone?: () => void }): void
  toBottom(smooth: boolean): void
  topRow(itemsOnly: boolean): { key: string; offset: number } | null
  bottomRow(): string | null
  isVisible(key: string): boolean
  scroller(): HTMLElement | null
}

interface Ctx {
  users: Users
  chatId: number
  highlight: number | null
  selected: Set<number> | null
  replyIdx: ReplyIndex | null
  handlers: ItemHandlers
  onToggleSelect: (key: number) => void
  onDayTap: () => void
}

interface Props extends Ctx {
  rows: Row[]
  index: Map<string, number>
  initial: Place | 'bottom'
  clearance: () => Clearance
  bottomPad: string
  moreAbove: boolean
  moreBelow: boolean
  firstDate?: number
  onStartReached: () => void
  onEndReached: () => void
  onAtBottom: (b: boolean) => void
  onScroll: () => void
  onInitialDone?: () => void
}

const START_GAP = 44
const DEFAULT_H = 72
const KEEP = 1.5
const FILL = 2.5
const IDLE_FILL = 4
const TRIM = 6
const MEASURE_AHEAD = 160
const MEASURE_BATCH = 8
const STEP = 3
const IDLE_STEP = 16
const LOAD_AHEAD = 120

function replyCount(idx: ReplyIndex | null, item: Item) {
  if (!idx || item.kind !== 'msg') return undefined
  let n = 0
  for (const m of item.msgs) n += idx.get(m.id)?.length ?? 0
  return n || undefined
}

const RowView = memo(function RowView({ row, ctx }: { row: Row; ctx: Ctx }) {
  if (row.kind === 'day') {
    return (
      <div className="flex justify-center py-1.5">
        <button onClick={ctx.onDayTap} data-press className="hit glass-lite glass-press rounded-full px-3 py-1 text-[13px] font-medium text-label">
          {dayLabel(row.ts)}
        </button>
      </div>
    )
  }
  if (row.kind === 'unread') {
    return (
      <Separator.Root decorative={false} className="my-2 flex justify-center bg-black/[0.06] py-1 text-[13px] font-medium text-label2 dark:bg-white/[0.06]">
        以下为新消息
      </Separator.Root>
    )
  }
  const { item } = row
  const replies = replyCount(ctx.replyIdx, item)
  if (ctx.selected && item.kind === 'msg') {
    return (
      <SelectRow on={ctx.selected.has(item.key)} onToggle={() => ctx.onToggleSelect(item.key)}>
        <MessageItem item={item} users={ctx.users} chatId={ctx.chatId} highlighted={false} replies={replies} {...ctx.handlers} />
      </SelectRow>
    )
  }
  return <MessageItem item={item} users={ctx.users} chatId={ctx.chatId} highlighted={ctx.highlight === item.key} replies={replies} {...ctx.handlers} />
})

interface Win {
  lo: string
  hi: string
}

const clampIdx = (i: number, n: number) => Math.max(0, Math.min(n - 1, i))

class BeforeCommit extends Component<{ tick: unknown; take: () => void }> {
  getSnapshotBeforeUpdate() {
    this.props.take()
    return null
  }
  componentDidUpdate() {}
  render() {
    return null
  }
}

class Fenwick {
  t: Float64Array
  constructor(n: number) {
    this.t = new Float64Array(n + 1)
  }
  add(i: number, v: number) {
    for (i++; i < this.t.length; i += i & -i) this.t[i] += v
  }
  sum(i: number) {
    let s = 0
    for (; i > 0; i -= i & -i) s += this.t[i]
    return s
  }
}

export const MessageList = memo(
  forwardRef<ListHandle, Props>(function MessageList(props, ref) {
    const { rows, index, initial, clearance, onStartReached, onEndReached, onAtBottom, onScroll, onInitialDone } = props
    const n = rows.length
    const scroller = useRef<HTMLDivElement>(null)
    const content = useRef<HTMLDivElement>(null)
    const measurer = useRef<HTMLDivElement>(null)

    const ctx: Ctx = {
      users: props.users,
      chatId: props.chatId,
      highlight: props.highlight,
      selected: props.selected,
      replyIdx: props.replyIdx,
      handlers: props.handlers,
      onToggleSelect: props.onToggleSelect,
      onDayTap: props.onDayTap,
    }
    const ctxRef = useRef(ctx)
    if ((Object.keys(ctx) as (keyof Ctx)[]).some((k) => ctx[k] !== ctxRef.current[k])) ctxRef.current = ctx
    const stableCtx = ctxRef.current

    const heights = useRef(new Map<string, number>())
    const [width, setWidth] = useState(0)
    const widthKey = useRef(0)
    if (width && !widthKey.current) widthKey.current = width
    const sig = `${width ? width : widthKey.current}:${props.selected ? 1 : 0}:${props.replyIdx ? 1 : 0}`
    const sigRef = useRef(sig)
    if (sigRef.current !== sig && !sigRef.current.startsWith('0:')) {
      heights.current = new Map()
    }
    sigRef.current = sig
    const sizes = useRef<{ rows: Row[]; map: Map<string, number>; known: Fenwick; unknown: Fenwick } | null>(null)
    if (!sizes.current || sizes.current.rows !== rows || sizes.current.map !== heights.current) {
      const known = new Fenwick(rows.length)
      const unknown = new Fenwick(rows.length)
      rows.forEach((r, i) => {
        const h = heights.current.get(r.key)
        if (h == null) unknown.add(i, 1)
        else known.add(i, h)
      })
      sizes.current = { rows, map: heights.current, known, unknown }
    }
    const setHeight = (key: string, h: number) => {
      const old = heights.current.get(key)
      if (old === h) return false
      heights.current.set(key, h)
      const sz = sizes.current
      const i = sz && sz.map === heights.current && sz.rows === live.current.rows ? live.current.index.get(key) : undefined
      if (sz && i != null) {
        if (old == null) sz.unknown.add(i, -1)
        sz.known.add(i, h - (old ?? 0))
      }
      return true
    }
    const hOf = (key: string) => heights.current.get(key) ?? DEFAULT_H

    const around = (rs: Row[], i: number, span = 30): Win => ({ lo: rs[clampIdx(i - span, rs.length)]?.key ?? '', hi: rs[clampIdx(i + span, rs.length)]?.key ?? '' })
    const [win, setWin] = useState<Win>(() => {
      const screen = Math.ceil(window.innerHeight / 40)
      if (initial === 'bottom') return { lo: rows[Math.max(0, n - screen)]?.key ?? '', hi: rows[n - 1]?.key ?? '' }
      return around(rows, index.get(initial.key) ?? n - 1, Math.ceil(screen / 2) + 2)
    })
    let lo = index.get(win.lo) ?? 0
    let hi = Math.min(n, (index.get(win.hi) ?? n - 1) + 1)
    if (lo >= hi) {
      lo = Math.max(0, n - 60)
      hi = n
    }

    const { known, unknown } = sizes.current
    const topSpace = known.sum(lo) + unknown.sum(lo) * DEFAULT_H
    const bottomSpace = known.sum(n) - known.sum(hi) + (unknown.sum(n) - unknown.sum(hi)) * DEFAULT_H

    const live = useRef({ rows, index, lo, hi, n, clearance, onScroll, onStartReached, onEndReached, onAtBottom })
    live.current = { rows, index, lo, hi, n, clearance, onScroll, onStartReached, onEndReached, onAtBottom }

    const anchor = useRef<{ key: string; top: number } | null>(null)
    const lock = useRef<Place | null>(null)
    const written = useRef<number | null>(null)
    const pinnedBottom = useRef(initial === 'bottom')
    const rowEl = (key: string) => content.current?.querySelector<HTMLElement>(`:scope > [data-row="${CSS.escape(key)}"]`) ?? null

    const anchorEl = useRef<HTMLElement | null>(null)
    const recordAnchor = useCallback(() => {
      const sc = scroller.current
      const ct = content.current
      if (!sc || !ct) return
      if (lock.current && ct.querySelector(`:scope > [data-row="${CSS.escape(lock.current.key)}"]`)) {
        pinnedBottom.current = false
        return
      }
      pinnedBottom.current = sc.scrollTop > -2
      const sr = sc.getBoundingClientRect()
      const line = sr.top + sr.height * 0.35
      const prev = anchorEl.current
      if (prev?.isConnected && prev.parentElement === ct) {
        const r = prev.getBoundingClientRect()
        if (r.bottom > line && r.top < line + sr.height * 0.3) {
          anchor.current = { key: prev.dataset.row!, top: r.top - sr.top }
          return
        }
      }
      for (const el of ct.querySelectorAll<HTMLElement>(':scope > [data-row]')) {
        const r = el.getBoundingClientRect()
        if (r.bottom > line) {
          anchorEl.current = el
          anchor.current = { key: el.dataset.row!, top: r.top - sr.top }
          return
        }
      }
      anchorEl.current = null
      anchor.current = null
    }, [])

    const restoreAnchor = useCallback(() => {
      const sc = scroller.current
      if (!sc) return
      if (lock.current && applyPlace(lock.current) !== null) return
      if (pinnedBottom.current) {
        if (sc.scrollTop !== 0) sc.scrollTop = 0
        return
      }
      const a = anchor.current
      const el = a && content.current?.querySelector<HTMLElement>(`:scope > [data-row="${CSS.escape(a.key)}"]`)
      if (!a || !el) return
      const d = el.getBoundingClientRect().top - sc.getBoundingClientRect().top - a.top
      if (Math.abs(d) > 0.5) {
        sc.scrollTop += d
        written.current = sc.scrollTop
      }
    }, [])

    const pending = useRef<{ p: Place; onDone?: () => void } | null>(null)
    const job = useRef(0)
    const raf = useRef(0)

    const desiredTop = (p: Place, h: number, sc: HTMLElement) => {
      const c = live.current.clearance()
      if (p.align === 'offset') return p.offset ?? c.top
      const space = sc.clientHeight - c.top - c.bottom
      if (p.align === 'start' || h > space * 0.7) return c.top + (p.align === 'start' ? (p.offset ?? START_GAP) : START_GAP)
      return c.top + (space - h) * 0.4
    }

    const applyPlace = (p: Place): boolean | null => {
      const sc = scroller.current
      const el = rowEl(p.key)
      if (!sc || !el) return null
      lock.current = p
      const r = el.getBoundingClientRect()
      const d = r.top - sc.getBoundingClientRect().top - desiredTop(p, r.height, sc)
      if (Math.abs(d) < 0.5) return true
      const before = sc.scrollTop
      sc.scrollTop += d
      written.current = sc.scrollTop
      return Math.abs(sc.scrollTop - before) < 0.25
    }

    const cancelJob = useCallback(() => {
      job.current++
      cancelAnimationFrame(raf.current)
      lock.current = null
    }, [])

    const verify = (p: Place, onDone?: () => void) => {
      const id = ++job.current
      let stable = 0
      let frames = 0
      const step = () => {
        if (id !== job.current) return
        const ok = applyPlace(p)
        recordAnchor()
        if (ok === null) return onDone?.()
        stable = ok ? stable + 1 : 0
        if (stable >= 3 || ++frames > 90) return onDone?.()
        raf.current = requestAnimationFrame(step)
      }
      raf.current = requestAnimationFrame(step)
    }

    useImperativeHandle(
      ref,
      () => ({
        place(p, opts = {}) {
          cancelJob()
          pinnedBottom.current = false
          const sc = scroller.current
          const el = rowEl(p.key)
          if (!el || !sc) {
            const i = live.current.index.get(p.key)
            if (i == null) return opts.onDone?.()
            pending.current = { p, onDone: opts.onDone }
            setWin(around(live.current.rows, i, 40))
            return
          }
          const r = el.getBoundingClientRect()
          const d = r.top - sc.getBoundingClientRect().top - desiredTop(p, r.height, sc)
          if (!opts.smooth || Math.abs(d) > sc.clientHeight * 3 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            applyPlace(p)
            recordAnchor()
            verify(p, opts.onDone)
            return
          }
          const id = job.current
          let t = 0
          const finish = () => {
            sc.removeEventListener('scrollend', finish)
            window.clearTimeout(t)
            if (id === job.current) verify(p, opts.onDone)
          }
          sc.addEventListener('scrollend', finish)
          t = window.setTimeout(finish, 700)
          sc.scrollBy({ top: d, behavior: 'smooth' })
        },
        toBottom(smooth) {
          cancelJob()
          const sc = scroller.current
          if (!sc) return
          const { lo: l, hi: h, n: total, rows: rs } = live.current
          if (h < total || !smooth || sc.scrollTop < -sc.clientHeight * 3) {
            pinnedBottom.current = true
            if (h < total || l > total - 20) setWin({ lo: rs[Math.max(0, total - 60)].key, hi: rs[total - 1].key })
            sc.scrollTop = 0
            return
          }
          sc.scrollTo({ top: 0, behavior: 'smooth' })
        },
        topRow(itemsOnly) {
          const sc = scroller.current
          const ct = content.current
          if (!sc || !ct) return null
          const sr = sc.getBoundingClientRect()
          const line = sr.top + live.current.clearance().top
          for (const el of ct.querySelectorAll<HTMLElement>(itemsOnly ? ':scope > [data-kind="item"]' : ':scope > [data-row]')) {
            const r = el.getBoundingClientRect()
            if (r.bottom > line) return { key: el.dataset.row!, offset: r.top - sr.top }
          }
          return null
        },
        bottomRow() {
          const sc = scroller.current
          const ct = content.current
          if (!sc || !ct) return null
          const line = sc.getBoundingClientRect().bottom - live.current.clearance().bottom
          let found: string | null = null
          for (const el of ct.querySelectorAll<HTMLElement>(':scope > [data-row]')) {
            if (el.getBoundingClientRect().top < line) found = el.dataset.row!
            else break
          }
          return found
        },
        isVisible(key) {
          const sc = scroller.current
          const el = rowEl(key)
          if (!sc || !el) return false
          const sr = sc.getBoundingClientRect()
          const r = el.getBoundingClientRect()
          const c = live.current.clearance()
          return r.top >= sr.top + c.top - 1 && r.bottom <= sr.bottom - c.bottom + 1
        },
        scroller: () => scroller.current,
      }),
      [cancelJob, recordAnchor],
    )

    const updateWindow = useCallback((idle = false) => {
      const fill = idle ? IDLE_FILL : FILL
      const keep = idle ? IDLE_FILL : KEEP
      const step = idle ? IDLE_STEP : STEP
      const sc = scroller.current
      const ct = content.current
      const { rows: rs, lo: l, hi: h, n: total } = live.current
      if (!sc || !ct || !total || pending.current) return
      const kids = ct.children
      const firstEl = kids.length > 4 ? (kids[2] as HTMLElement) : null
      const lastEl = kids.length > 4 ? (kids[kids.length - 3] as HTMLElement) : null
      const sr = sc.getBoundingClientRect()
      const vh = sc.clientHeight
      let nl = l
      let nh = h
      if (!firstEl?.dataset.row || !lastEl?.dataset.row) {
        nl = Math.max(0, total - 60)
        nh = total
      } else {
        const fr = firstEl.getBoundingClientRect()
        const lr = lastEl.getBoundingClientRect()
        if (lr.bottom < sr.top - vh || fr.top > sr.bottom + vh) {
          const y = sr.top - ct.getBoundingClientRect().top - (ct.firstElementChild as HTMLElement).offsetHeight
          let acc = 0
          let i = 0
          for (; i < total - 1; i++) {
            acc += hOf(rs[i].key)
            if (acc > y) break
          }
          nl = Math.max(0, i - 15)
          nh = Math.min(total, i + 15)
        } else {
          if (fr.top > sr.top - vh * keep) {
            let need = fr.top - (sr.top - vh * fill)
            while (nl > 0 && need > 0 && l - nl < step) need -= hOf(rs[--nl].key)
          } else if (fr.top < sr.top - vh * (TRIM + 1)) {
            let y = fr.top
            while (nl < h - 1 && y + hOf(rs[nl].key) < sr.top - vh * TRIM) y += hOf(rs[nl++].key)
          }
          if (lr.bottom < sr.bottom + vh * keep) {
            let need = sr.bottom + vh * fill - lr.bottom
            while (nh < total && need > 0 && nh - h < step) need -= hOf(rs[nh++].key)
          } else if (lr.bottom > sr.bottom + vh * (TRIM + 1)) {
            let y = lr.bottom
            while (nh > nl + 1 && y - hOf(rs[nh - 1].key) > sr.bottom + vh * TRIM) y -= hOf(rs[--nh].key)
          }
        }
      }
      if (nl !== l || nh !== h) {
        const next = { lo: rs[nl].key, hi: rs[nh - 1].key }
        flushSync(() => setWin(next))
      }
      if (nl < LOAD_AHEAD) live.current.onStartReached()
      if (total - nh < LOAD_AHEAD) live.current.onEndReached()
    }, [])

    useLayoutEffect(() => {
      const ct = content.current
      if (ct) for (const el of ct.querySelectorAll<HTMLElement>(':scope > [data-row]')) if (!heights.current.has(el.dataset.row!)) setHeight(el.dataset.row!, el.offsetHeight)
      const pend = pending.current
      if (pend && !live.current.index.has(pend.p.key)) {
        pending.current = null
        pend.onDone?.()
      } else if (pend && rowEl(pend.p.key)) {
        pending.current = null
        applyPlace(pend.p)
        recordAnchor()
        verify(pend.p, pend.onDone)
        return
      }
      restoreAnchor()
      recordAnchor()
    })

    useEffect(() => {
      let frame = 0
      const cancel = afterTransition(() => {
        frame = requestAnimationFrame(() => updateWindow(performance.now() - lastScroll.current > 300))
      }, 300)
      return () => {
        cancel()
        cancelAnimationFrame(frame)
      }
    })

    useEffect(() => {
      const ct = content.current
      if (!ct) return
      const ro = new ResizeObserver((entries) => {
        let changed = false
        for (const e of entries) {
          const el = e.target as HTMLElement
          if (!el.isConnected || !el.dataset.row) continue
          if (setHeight(el.dataset.row, el.offsetHeight)) changed = true
        }
        if (changed) {
          restoreAnchor()
          recordAnchor()
        }
      })
      const observe = () => ct.querySelectorAll<HTMLElement>(':scope > [data-row]').forEach((el) => ro.observe(el))
      observe()
      const mo = new MutationObserver(observe)
      mo.observe(ct, { childList: true })
      return () => {
        ro.disconnect()
        mo.disconnect()
      }
    }, [restoreAnchor, recordAnchor])

    useEffect(() => {
      const sc = scroller.current
      if (!sc) return
      const ro = new ResizeObserver(() => setWidth(content.current?.clientWidth ?? 0))
      ro.observe(sc)
      return () => ro.disconnect()
    }, [])

    const lastScroll = useRef(0)
    const [measure, setMeasure] = useState<Row[]>([])
    const [, setMeasureTick] = useState(0)
    useEffect(() => {
      if (measure.length || !width) return
      const since = performance.now() - lastScroll.current
      if (since < 300) {
        const t = window.setTimeout(() => setMeasureTick((x) => x + 1), 300 - since)
        return () => window.clearTimeout(t)
      }
      const todo: Row[] = []
      for (let i = hi; i < Math.min(n, hi + MEASURE_AHEAD) && todo.length < MEASURE_BATCH; i++) if (!heights.current.has(rows[i].key)) todo.push(rows[i])
      if (!todo.length) return
      const run = () => setMeasure(todo)
      if (typeof requestIdleCallback === 'function') {
        const id = requestIdleCallback(run)
        return () => cancelIdleCallback(id)
      }
      const t = window.setTimeout(run, 200)
      return () => window.clearTimeout(t)
    })
    useLayoutEffect(() => {
      const m = measurer.current
      if (!m || !measure.length) return
      recordAnchor()
      for (const el of m.querySelectorAll<HTMLElement>(':scope > [data-mrow]')) setHeight(el.dataset.mrow!, el.offsetHeight)
      setMeasure([])
    }, [measure, recordAnchor])

    useEffect(() => {
      const sc = scroller.current
      if (!sc) return
      let frame = 0
      const onUser = () => cancelJob()
      const onScrollEv = () => {
        lastScroll.current = performance.now()
        if (lock.current && written.current != null && Math.abs(sc.scrollTop - written.current) > 1) cancelJob()
        recordAnchor()
        live.current.onScroll()
        if (!frame)
          frame = requestAnimationFrame(() => {
            frame = 0
            updateWindow()
          })
      }
      sc.addEventListener('wheel', onUser, { passive: true })
      sc.addEventListener('touchstart', onUser, { passive: true })
      sc.addEventListener('keydown', onUser)
      sc.addEventListener('pointerdown', onUser, { passive: true })
      sc.addEventListener('scroll', onScrollEv, { passive: true })
      return () => {
        cancelAnimationFrame(frame)
        sc.removeEventListener('wheel', onUser)
        sc.removeEventListener('touchstart', onUser)
        sc.removeEventListener('keydown', onUser)
        sc.removeEventListener('pointerdown', onUser)
        sc.removeEventListener('scroll', onScrollEv)
      }
    }, [cancelJob, recordAnchor, updateWindow])

    const bottomSentinel = useRef<HTMLDivElement>(null)
    useEffect(() => {
      const sc = scroller.current
      const el = bottomSentinel.current
      if (!sc || !el) return
      const io = new IntersectionObserver(([e]) => live.current.onAtBottom(e.isIntersecting), { root: sc, rootMargin: '0px 0px 80px 0px' })
      io.observe(el)
      return () => io.disconnect()
    }, [])

    useLayoutEffect(() => {
      setWidth(content.current?.clientWidth ?? 0)
      if (initial === 'bottom') {
        const sc = scroller.current
        if (sc) sc.scrollTop = 0
        recordAnchor()
        const id = requestAnimationFrame(() => onInitialDone?.())
        return () => cancelAnimationFrame(id)
      }
      if (rowEl(initial.key)) {
        applyPlace(initial)
        recordAnchor()
        verify(initial, onInitialDone)
      } else pending.current = { p: initial, onDone: onInitialDone }
      return cancelJob
    }, [])

    const items = []
    for (let i = lo; i < hi; i++) {
      const row = rows[i]
      const h = heights.current.get(row.key)
      items.push(
        <div key={row.key} data-row={row.key} data-kind={row.kind} className="flow-root" style={h ? { contentVisibility: 'auto', containIntrinsicSize: `auto ${h}px` } : undefined}>
          <RowView row={row} ctx={stableCtx} />
        </div>,
      )
    }

    return (
      <>
        <BeforeCommit tick={{}} take={recordAnchor} />
        <div ref={scroller} className="scroller messages absolute inset-0 flex flex-col-reverse">
          <div ref={content} className="flow-root shrink-0">
            <div className="pt-[calc(var(--safe-top)+var(--nav-h))]">
              <div className="flex h-20 items-center justify-center px-6">
                {props.moreAbove ? (
                  <Spinner />
                ) : (
                  <div className="glass-lite rounded-[18px] px-3.5 py-2 text-center text-[13px] leading-snug text-label">
                    存档从这里开始
                    {props.firstDate ? <div className="text-[12px] opacity-80">{fullDate(props.firstDate)}</div> : null}
                  </div>
                )}
              </div>
            </div>
            <div style={{ height: topSpace }} />
            {items}
            <div style={{ height: bottomSpace }} />
            <div style={{ paddingBottom: props.bottomPad }}>
              {props.moreBelow && (
                <div className="flex h-16 items-center justify-center">
                  <Spinner />
                </div>
              )}
              <div ref={bottomSentinel} aria-hidden className="h-px" />
            </div>
          </div>
        </div>
        {measure.length > 0 && (
          <div ref={measurer} aria-hidden inert className="pointer-events-none invisible absolute left-0 flow-root" style={{ top: -100000, width }}>
            {measure.map((row) => (
              <div key={row.key} data-mrow={row.key} className="flow-root">
                <RowView row={row} ctx={stableCtx} />
              </div>
            ))}
          </div>
        )}
      </>
    )
  }),
)
