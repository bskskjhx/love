import { dayKey } from '../lib/format'
import type { Message } from '../lib/types'

export type Item =
  | { kind: 'msg'; key: number; msgs: Message[]; first: boolean; last: boolean }
  | { kind: 'svc'; key: number; msg: Message }

export interface Day {
  key: string
  ts: number
  items: Item[]
}

const GROUP_GAP = 10 * 60
const ALBUM_TYPES = new Set(['photo', 'video', 'gif'])
export const inAlbum = (m: Message) => !!m.group && !m.svc && ALBUM_TYPES.has(m.media?.type ?? '')

function sameSender(a: Message | undefined, b: Message | undefined): boolean {
  return !!a && !!b && !a.svc && !b.svc && a.from === b.from && Math.abs(b.date - a.date) < GROUP_GAP && !a.fwd === !b.fwd
}

export function groupMessages(msgs: Message[]): Day[] {
  const days: Day[] = []
  let day: Day | undefined
  let i = 0
  while (i < msgs.length) {
    const m = msgs[i]
    const key = dayKey(m.date)
    if (!day || day.key !== key) {
      day = { key, ts: m.date, items: [] }
      days.push(day)
    }
    if (m.svc) {
      day.items.push({ kind: 'svc', key: m.id, msg: m })
      i++
      continue
    }
    const album = [m]
    if (inAlbum(m)) {
      while (i + album.length < msgs.length) {
        const n = msgs[i + album.length]
        if (n.group !== m.group || n.from !== m.from || !inAlbum(n)) break
        album.push(n)
      }
    }
    day.items.push({ kind: 'msg', key: m.id, msgs: album, first: true, last: true })
    i += album.length
  }
  for (const d of days) {
    for (let j = 0; j < d.items.length; j++) {
      const it = d.items[j]
      if (it.kind !== 'msg') continue
      const prev = d.items[j - 1]
      const next = d.items[j + 1]
      const head = it.msgs[0]
      const tail = it.msgs[it.msgs.length - 1]
      it.first = !(prev?.kind === 'msg' && sameSender(prev.msgs[prev.msgs.length - 1], head))
      it.last = !(next?.kind === 'msg' && sameSender(tail, next.msgs[0]))
    }
  }
  return days
}

export function anchorIds(days: Day[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const d of days)
    for (const it of d.items) {
      if (it.kind === 'svc') map.set(it.msg.id, it.msg.id)
      else for (const m of it.msgs) map.set(m.id, it.key)
    }
  return map
}
