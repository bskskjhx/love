import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { pad, parts } from './format'
import { scanChat } from './scan'
import type { ChatMeta, Message } from './types'

/** 消息类型（统计用，比共享媒体的分类更细） */
export const KINDS = [
  ['text', '文字'],
  ['photo', '图片'],
  ['video', '视频'],
  ['sticker', '贴纸'],
  ['voice', '语音'],
  ['file', '文件'],
  ['link', '链接'],
  ['poll', '投票'],
  ['other', '其它'],
] as const
export type Kind = (typeof KINDS)[number][0]

function kindOf(m: Message): Kind {
  switch (m.media?.type) {
    case undefined:
      return 'text'
    case 'photo':
      return 'photo'
    case 'video':
    case 'gif':
    case 'round':
      return 'video'
    case 'sticker':
      return 'sticker'
    case 'voice':
      return 'voice'
    case 'audio':
    case 'file':
      return 'file'
    case 'webpage':
      return 'link'
    case 'poll':
      return 'poll'
    default:
      return 'other'
  }
}

/** 一个统计对象（全群或某个成员） */
export interface Tally {
  total: number
  /** 天序号（存档时区的日期，自 1970-01-01 起的天数）→ 条数 */
  days: Map<number, number>
  hours: number[]
  /** 0 = 周日 */
  weekdays: number[]
  /** weekday * 24 + hour */
  heat: number[]
  kinds: Record<Kind, number>
  /** 文字字符数（不含媒体） */
  chars: number
  forwards: number
  replies: number
  first: number
  last: number
}

const tally = (): Tally => ({
  total: 0,
  days: new Map(),
  hours: Array(24).fill(0),
  weekdays: Array(7).fill(0),
  heat: Array(168).fill(0),
  kinds: Object.fromEntries(KINDS.map(([k]) => [k, 0])) as Record<Kind, number>,
  chars: 0,
  forwards: 0,
  replies: 0,
  first: Infinity,
  last: 0,
})

export interface ChatStats {
  group: Tally
  users: Map<number, Tally>
}

const DAY = 86400000
/** 天序号 ↔ 日期 */
export const dayNum = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / DAY
export const dateOf = (n: number) => {
  const d = new Date(n * DAY)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() }
}

function add(t: Tally, day: number, hour: number, wd: number, kind: Kind, m: Message) {
  t.total++
  t.days.set(day, (t.days.get(day) ?? 0) + 1)
  t.hours[hour]++
  t.weekdays[wd]++
  t.heat[wd * 24 + hour]++
  t.kinds[kind]++
  if (m.text) t.chars += [...m.text].length
  if (m.fwd) t.forwards++
  if (m.reply) t.replies++
  if (m.date < t.first) t.first = m.date
  if (m.date > t.last) t.last = m.date
}

/** 扫描进度（0–1），按群 id */
export const useStatsProgress = create<Record<number, number>>(() => ({}))

async function compute(meta: ChatMeta): Promise<ChatStats> {
  const group = tally()
  const users = new Map<number, Tally>()
  const done = await scanChat(
    meta,
    (m) => {
      if (m.svc) return // 服务消息（进群、置顶等）不算发言
      const p = parts(m.date)
      const day = dayNum(p.y, p.m, p.d)
      const hour = Number(p.hh)
      const kind = kindOf(m)
      add(group, day, hour, p.wd, kind, m)
      if (m.from != null) {
        let u = users.get(m.from)
        if (!u) users.set(m.from, (u = tally()))
        add(u, day, hour, p.wd, kind, m)
      }
    },
    { oldestFirst: true, onProgress: (p) => useStatsProgress.setState({ [meta.id]: p }) },
  )
  if (!done) throw new Error('统计被中断')
  return { group, users }
}

/** 全群统计；存档更新后（updatedAt 变化）重新计算 */
export function useChatStats(meta: ChatMeta | undefined) {
  return useQuery({
    queryKey: ['stats', meta?.id, meta?.updatedAt],
    queryFn: () => compute(meta!),
    enabled: !!meta,
  })
}

// ---- 聚合

export type Grain = 'day' | 'week' | 'month'

/** 桶的起始天序号 */
function bucketOf(day: number, grain: Grain): number {
  if (grain === 'day') return day
  const { y, m, wd } = dateOf(day)
  if (grain === 'week') return day - ((wd + 6) % 7) // 周一开始
  return dayNum(y, m, 1)
}

function nextBucket(b: number, grain: Grain): number {
  if (grain === 'day') return b + 1
  if (grain === 'week') return b + 7
  const { y, m } = dateOf(b)
  return m === 12 ? dayNum(y + 1, 1, 1) : dayNum(y, m + 1, 1)
}

export function bucketLabel(b: number, grain: Grain): string {
  const { y, m, d } = dateOf(b)
  if (grain === 'month') return `${y}-${pad(m)}`
  return `${y}-${pad(m)}-${pad(d)}`
}

/** 连续的桶（没有消息的也补 0），从 from 到 to 天 */
export function buckets(from: number, to: number, grain: Grain): number[] {
  const out: number[] = []
  if (!Number.isFinite(from) || !Number.isFinite(to)) return out
  for (let b = bucketOf(from, grain); b <= to; b = nextBucket(b, grain)) out.push(b)
  return out
}

/** 某个统计对象在各桶里的条数 */
export function series(t: Tally, keys: number[], grain: Grain): number[] {
  const idx = new Map(keys.map((k, i) => [k, i]))
  const out = Array(keys.length).fill(0)
  for (const [day, n] of t.days) {
    const i = idx.get(bucketOf(day, grain))
    if (i != null) out[i] += n
  }
  return out
}

/** 各桶里发过言的人数 */
export function activeSenders(stats: ChatStats, keys: number[], grain: Grain): number[] {
  const idx = new Map(keys.map((k, i) => [k, i]))
  const out = Array(keys.length).fill(0)
  const seen = new Set<number>()
  for (const t of stats.users.values()) {
    seen.clear()
    for (const day of t.days.keys()) {
      const i = idx.get(bucketOf(day, grain))
      if (i != null && !seen.has(i)) {
        seen.add(i)
        out[i]++
      }
    }
  }
  return out
}

/** 移动平均（窗口内不足时按已有的算） */
export function movingAverage(xs: number[], w: number): number[] {
  const out: number[] = []
  let sum = 0
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i]
    if (i >= w) sum -= xs[i - w]
    out.push(Math.round((sum / Math.min(i + 1, w)) * 10) / 10)
  }
  return out
}

/** 最高的一天 */
export function peakDay(t: Tally): [day: number, n: number] | undefined {
  let best: [number, number] | undefined
  for (const [d, n] of t.days) if (!best || n > best[1]) best = [d, n]
  return best
}

/** 最长连续发言天数 */
export function longestStreak(t: Tally): number {
  const days = [...t.days.keys()].sort((a, b) => a - b)
  let best = 0
  let run = 0
  for (let i = 0; i < days.length; i++) {
    run = i && days[i] === days[i - 1] + 1 ? run + 1 : 1
    if (run > best) best = run
  }
  return best
}

/** 按发言数排名（1 起） */
export function rankOf(stats: ChatStats, id: number): number | undefined {
  const me = stats.users.get(id)
  if (!me) return undefined
  let r = 1
  for (const t of stats.users.values()) if (t.total > me.total) r++
  return r
}
