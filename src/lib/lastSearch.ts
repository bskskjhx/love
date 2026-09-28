import { paths } from './router'
import { perChat } from './store'

interface LastSearch {
  q: string
  from?: number
  type?: string
}

const memory = perChat<LastSearch>('lastSearch', 'session')

export function rememberSearch(chatId: number, s: LastSearch) {
  memory.set(chatId, s.q.trim() || s.from != null || s.type ? { q: s.q.trim(), from: s.from, type: s.type } : undefined)
}

export function lastSearchPath(chatKey: string, chatId: number): string {
  const s = memory.get(chatId)
  return s ? paths.search(chatKey, s.q, s.from, s.type) : paths.search(chatKey)
}
