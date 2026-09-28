import type { ChatMeta, Message } from './types'

export const GENERAL = 1

/**
 * 消息属于哪个话题：新抓取的数据直接带 topic；旧存档按官方规则推算——
 * 话题里的普通消息“回复”的是话题创建消息，回复别的消息则沿回复链找，都没有则属于 General。
 */
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
