import type { Message } from '../lib/types'
import type { Day, Item } from './grouping'

export type Row =
  | { kind: 'day'; key: string; ts: number }
  | { kind: 'unread'; key: string }
  | { kind: 'item'; key: string; item: Item }

export const itemRowKey = (itemKey: number) => `m${itemKey}`

export function buildRows(days: Day[], firstUnreadKey?: number): Row[] {
  const rows: Row[] = []
  const seen = new Map<string, number>()
  for (const day of days) {
    const n = seen.get(day.key) ?? 0
    seen.set(day.key, n + 1)
    rows.push({ kind: 'day', key: n ? `d${day.key}#${n}` : `d${day.key}`, ts: day.ts })
    for (const item of day.items) {
      if (item.key === firstUnreadKey) rows.push({ kind: 'unread', key: 'unread' })
      rows.push({ kind: 'item', key: itemRowKey(item.key), item })
    }
  }
  return rows
}

export function rowIndex(rows: Row[]): Map<string, number> {
  const map = new Map<string, number>()
  rows.forEach((r, i) => map.set(r.key, i))
  return map
}

export function lastMessageId(row: Row | undefined): number | undefined {
  if (!row || row.kind !== 'item') return undefined
  const it = row.item
  return it.kind === 'svc' ? it.msg.id : it.msgs[it.msgs.length - 1].id
}

export function firstMessageId(row: Row | undefined): number | undefined {
  return firstMessage(row)?.id
}

export function firstMessageDate(row: Row | undefined): number | undefined {
  return firstMessage(row)?.date
}

function firstMessage(row: Row | undefined): Message | undefined {
  if (!row || row.kind !== 'item') return undefined
  const it = row.item
  return it.kind === 'svc' ? it.msg : it.msgs[0]
}
