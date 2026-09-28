import { describe, expect, it } from 'vitest'
import { anchorIds, groupMessages } from '../chat/grouping'
import { buildRows, firstMessageDate, firstMessageId, lastMessageId, rowIndex } from '../chat/rows'
import { countUpTo, getRead, markRead, unreadOf } from '../lib/readState'
import { threadOf } from '../lib/replies'
import { stepIndex } from '../lib/searchNav'
import { activeSenders, bucketLabel, buckets, dayNum, longestStreak, movingAverage, peakDay, rankOf, series, type ChatStats, type Tally } from '../lib/stats'
import { topicResolver } from '../lib/topics'
import type { ChatMeta, ChunkInfo, Message } from '../lib/types'

const m = (id: number, p: Partial<Message> = {}): Message => ({ id, date: 1700000000 + id * 60, from: 1, ...p })

describe('readState', () => {
  const chunks: ChunkInfo[] = [
    { n: 0, min: 1, max: 3, from: 0, to: 0, count: 3 },
    { n: 1, min: 4, max: 9, from: 0, to: 0, count: 4 },
  ]
  it('countUpTo', () => {
    expect(countUpTo(chunks, 1, [m(4), m(6), m(8), m(9)], 6)).toBe(5)
    expect(countUpTo(chunks, 0, [m(1), m(2), m(3)], 1)).toBe(1)
    expect(countUpTo(chunks, 1, [m(4)], 3)).toBe(3)
  })
  it('markRead 只前进，force 可后退；unreadOf', () => {
    markRead(42, { id: 10, n: 10 })
    markRead(42, { id: 5, n: 5 })
    expect(getRead(42)).toEqual({ id: 10, n: 10 })
    expect(unreadOf(42, 15)).toBe(5)
    expect(unreadOf(42, 3)).toBe(0)
    expect(unreadOf(42, undefined)).toBe(0)
    expect(unreadOf(43, 15)).toBe(0)
    markRead(42, { id: 5, n: 5 }, true)
    expect(getRead(42)).toEqual({ id: 5, n: 5 })
  })
})

describe('grouping / rows', () => {
  const photo = { type: 'photo' } as const
  const msgs = [m(1), m(2, { group: 'g', media: photo }), m(3, { group: 'g', media: photo }), m(4, { from: 2 }), m(5, { svc: { type: 'join' } }), m(6, { date: 1700000000 + 6 * 60 + 86400 })]
  const days = groupMessages(msgs)
  it('groupMessages', () => {
    expect(days.map((d) => d.items.map((i) => (i.kind === 'svc' ? `s${i.key}` : `${i.key}:${i.msgs.length}:${+i.first}${+i.last}`)))).toEqual([
      ['1:1:10', '2:2:01', '4:1:11', 's5'],
      ['6:1:11'],
    ])
  })
  it('anchorIds', () => {
    expect([...anchorIds(days)]).toEqual([[1, 1], [2, 2], [3, 2], [4, 4], [5, 5], [6, 6]])
  })
  it('buildRows / rowIndex / first/lastMessageId', () => {
    const rows = buildRows(days, 4)
    expect(rows.map((r) => r.key)).toEqual([`d${days[0].key}`, 'm1', 'm2', 'unread', 'm4', 'm5', `d${days[1].key}`, 'm6'])
    expect(rowIndex(rows).get('m4')).toBe(4)
    expect(firstMessageId(rows[2])).toBe(2)
    expect(lastMessageId(rows[2])).toBe(3)
    expect(lastMessageId(rows[5])).toBe(5)
    expect(firstMessageId(rows[0])).toBeUndefined()
    expect(lastMessageId(undefined)).toBeUndefined()
    expect(firstMessageDate(rows[2])).toBe(msgs[1].date)
    expect(firstMessageDate(rows[5])).toBe(msgs[4].date)
    expect(firstMessageDate(rows[3])).toBeUndefined()
  })
  it('成组发送的文件逐条显示，不合并成相册', () => {
    const file = { type: 'file' } as const
    const d = groupMessages([m(1, { group: 'f', media: file }), m(2, { group: 'f', media: file }), m(3, { group: 'p', media: photo }), m(4, { group: 'p', media: { type: 'video' } }), m(5, { group: 'p', media: file })])
    expect(d[0].items.map((i) => (i.kind === 'msg' ? i.msgs.map((x) => x.id) : []))).toEqual([[1], [2], [3, 4], [5]])
  })
  it('buildRows 同一天被隔开时 key 不重复', () => {
    const d = groupMessages([m(1)])
    expect(buildRows([...d, ...d]).map((r) => r.key)).toEqual([`d${d[0].key}`, 'm1', `d${d[0].key}#1`, 'm1'])
  })
})

describe('replies / searchNav / topics', () => {
  it('threadOf：广度优先、去重、排序、限量', () => {
    const idx = new Map([[1, [5, 3]], [3, [4, 5]], [4, [1]]])
    expect(threadOf(idx, 1)).toEqual([3, 4, 5])
    expect(threadOf(idx, 1, 1)).toEqual([3, 5])
    expect(threadOf(new Map(), 1)).toEqual([])
  })
  it('stepIndex 跳过同一相册', () => {
    const items = [{ id: 9 }, { id: 8, group: 'a' }, { id: 7, group: 'a' }, { id: 6 }]
    expect(stepIndex(items, 0, 1)).toBe(1)
    expect(stepIndex(items, 1, 1)).toBe(3)
    expect(stepIndex(items, 3, 1)).toBe(-1)
    expect(stepIndex(items, 2, -1)).toBe(0)
  })
  it('topicResolver', () => {
    const meta = { id: 1, title: '', chunks: [], days: {}, topics: [{ id: 10, title: 't' }] } as ChatMeta
    const all = new Map<number, Message>([
      [10, m(10, { svc: { type: 'topic_create' } })],
      [11, m(11, { reply: { id: 10 } })],
      [12, m(12, { reply: { id: 11 } })],
      [13, m(13, { topic: 7 })],
      [14, m(14)],
      [15, m(15, { reply: { id: 13 } })],
    ])
    const of = topicResolver(meta)
    const get = (id: number) => all.get(id)
    expect([10, 11, 12, 13, 14, 15].map((id) => of(all.get(id)!, get))).toEqual([10, 10, 10, 7, 1, 7])
  })
})

describe('stats 聚合', () => {
  const t = (days: [number, number][], total = 0): Tally => ({ total, days: new Map(days) } as unknown as Tally)
  const d0 = dayNum(2024, 1, 29) // 周一
  it('buckets / bucketLabel', () => {
    expect(buckets(d0, d0 + 2, 'day')).toEqual([d0, d0 + 1, d0 + 2])
    expect(buckets(d0 + 3, d0 + 10, 'week')).toEqual([d0, d0 + 7])
    expect(buckets(d0, dayNum(2024, 3, 1), 'month').map((b) => bucketLabel(b, 'month'))).toEqual(['2024-01', '2024-02', '2024-03'])
    expect(buckets(dayNum(2024, 12, 5), dayNum(2025, 1, 2), 'month').map((b) => bucketLabel(b, 'day'))).toEqual(['2024-12-01', '2025-01-01'])
    const none = new Map<number, number>().keys()
    expect(buckets(Math.min(...none), Math.max(...none), 'day')).toEqual([])
    expect(buckets(-Infinity - 29, -Infinity, 'day')).toEqual([])
    expect(buckets(d0, NaN, 'week')).toEqual([])
  })
  it('series / activeSenders', () => {
    const keys = buckets(d0, d0 + 13, 'week')
    expect(series(t([[d0, 2], [d0 + 6, 1], [d0 + 7, 5], [d0 + 99, 1]]), keys, 'week')).toEqual([3, 5])
    const stats = { group: t([]), users: new Map([[1, t([[d0, 1], [d0 + 1, 1]])], [2, t([[d0 + 8, 1]])]]) } as ChatStats
    expect(activeSenders(stats, keys, 'week')).toEqual([1, 1])
  })
  it('movingAverage / peakDay / longestStreak / rankOf', () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5])
    expect(movingAverage([1, 2], 3)).toEqual([1, 1.5])
    expect(peakDay(t([[1, 2], [2, 5], [3, 5]]))).toEqual([2, 5])
    expect(peakDay(t([]))).toBeUndefined()
    expect(longestStreak(t([[5, 1], [1, 1], [2, 1], [3, 1], [7, 1]]))).toBe(3)
    expect(longestStreak(t([]))).toBe(0)
    const stats = { group: t([]), users: new Map([[1, t([], 5)], [2, t([], 9)], [3, t([], 5)]]) } as ChatStats
    expect(rankOf(stats, 1)).toBe(2)
    expect(rankOf(stats, 2)).toBe(1)
    expect(rankOf(stats, 9)).toBeUndefined()
  })
})
