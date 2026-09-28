import { useEffect, useState } from 'react'
import { dataUrl } from './api'
import { afterTransition } from './idle'
import { scanChat } from './scan'
import type { ChatMeta } from './types'

/** 被回复消息 id → 直接回复它的消息 id（升序） */
export type ReplyIndex = Map<number, number[]>

const cache = new Map<number, Promise<ReplyIndex>>()
/** 已加载完成的索引：再次进入聊天时首帧就能用，回复数不会晚一拍出现把内容顶下去 */
const ready = new Map<number, ReplyIndex>()

/** 抓取脚本生成的 replies.json；旧存档没有时在浏览器里扫描一遍构建 */
export function loadReplies(meta: ChatMeta): Promise<ReplyIndex> {
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
            // 论坛里“发在话题中”的旧数据会记成回复话题创建消息，不算回复
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

/**
 * 聊天页用：转场结束后再加载，拿到之前返回 null。
 * beforeUpdate 在索引到达、即将重渲染前调用（聊天页借此记下滚动锚点，避免回复数出现后内容跳动）
 */
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

/** 整个回复串：直接回复与回复的回复，按时间排序 */
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
