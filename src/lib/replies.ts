import { useEffect, useState } from 'react'
import { dataUrl } from './api'
import { afterTransition } from './idle'
import { scanChat } from './scan'
import type { ChatMeta } from './types'

export type ReplyIndex = Map<number, number[]>

const cache = new Map<number, Promise<ReplyIndex>>()
const ready = new Map<number, ReplyIndex>()

function loadReplies(meta: ChatMeta): Promise<ReplyIndex> {
  let p = cache.get(meta.id)
  if (!p) {
    p = fetch(dataUrl(`chats/${meta.id}/replies.json`), { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<Record<string, number[]>>
      })
      .then((obj) => new Map(Object.entries(obj).map(([k, v]) => [Number(k), v])))
      .catch(async () => {
        const idx: ReplyIndex = new Map()
        await scanChat(
          meta,
          (m) => {
            const r = m.reply
            if (!r || r.ext || m.svc) return
            if (meta.forum && meta.topics?.some((t) => t.id === r.id)) return
            const list = idx.get(r.id)
            if (list) list.push(m.id)
            else idx.set(r.id, [m.id])
          },
          { oldestFirst: true },
        )
        return idx
      })
    p.then((idx) => ready.set(meta.id, idx))
    cache.set(meta.id, p)
  }
  return p
}

export function useReplies(meta: ChatMeta, beforeUpdate?: () => void): ReplyIndex | null {
  const [idx, setIdx] = useState<ReplyIndex | null>(() => ready.get(meta.id) ?? null)
  useEffect(() => {
    if (ready.has(meta.id)) return
    let alive = true
    const cancel = afterTransition(
      () =>
        void loadReplies(meta).then((r) => {
          if (!alive) return
          beforeUpdate?.()
          setIdx(r)
        }),
    )
    return () => {
      alive = false
      cancel()
    }
  }, [meta])
  return idx
}

export function threadOf(idx: ReplyIndex, root: number, limit = 300): number[] {
  const out: number[] = []
  const queue = [root]
  const seen = new Set([root])
  while (queue.length && out.length < limit) {
    for (const id of idx.get(queue.shift()!) ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
      queue.push(id)
    }
  }
  return out.sort((a, b) => a - b)
}
