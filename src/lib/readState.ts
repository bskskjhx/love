import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistStorage } from './store'
import type { ChunkInfo, Message } from './types'

interface ReadMark {
  id: number
  n: number
}

const useReadStore = create<Record<string, ReadMark>>()(
  persist(() => ({}), { name: 'readState', storage: persistStorage('local', (v) => (v && typeof v === 'object' ? (v as Record<string, ReadMark>) : {})) }),
)

export function getRead(chatId: number): ReadMark | undefined {
  return useReadStore.getState()[chatId]
}

export function markRead(chatId: number, mark: ReadMark, force = false) {
  const cur = useReadStore.getState()[chatId]
  if (!force && cur && cur.id >= mark.id) return
  useReadStore.setState({ [chatId]: mark })
}

export function countUpTo(chunks: ChunkInfo[], n: number, msgs: Message[], id: number): number {
  let before = 0
  for (const c of chunks) {
    if (c.n >= n) break
    before += c.count
  }
  let i = 0
  while (i < msgs.length && msgs[i].id <= id) i++
  return before + i
}

const unreadCount = (r: ReadMark | undefined, count: number | undefined) => (r && count ? Math.max(0, count - r.n) : 0)

export function unreadOf(chatId: number, count: number | undefined): number {
  return unreadCount(useReadStore.getState()[chatId], count)
}

export const useReadState = () => useReadStore()

export function useUnread(chatId: number, count: number | undefined): number {
  return useReadStore((s) => unreadCount(s[chatId], count))
}
