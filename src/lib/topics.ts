import type { ChatMeta, Message } from './types'

export const GENERAL = 1

export function topicResolver(meta: ChatMeta) {
  const ids = new Set(meta.topics?.map((t) => t.id) ?? [])
  const cache = new Map<number, number>()
  return function topicOf(m: Message, byId: (id: number) => Message | undefined): number {
    if (m.topic) return m.topic
    const hit = cache.get(m.id)
    if (hit) return hit
    let t = GENERAL
    if (m.svc?.type === 'topic_create') t = m.id
    else {
      let cur: Message | undefined = m
      for (let depth = 0; cur && depth < 50; depth++) {
        if (cur.topic) {
          t = cur.topic
          break
        }
        const r: number | undefined = cur.reply?.id
        if (r == null) break
        if (ids.has(r)) {
          t = r
          break
        }
        cur = byId(r)
      }
    }
    cache.set(m.id, t)
    return t
  }
}
