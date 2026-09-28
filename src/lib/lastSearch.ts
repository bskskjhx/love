import { paths } from './router'
import { perChat } from './store'

/** 每个群最近一次的搜索条件：再次打开搜索时直接回到上次的结果 */
interface LastSearch {
  q: string
  from?: number
  type?: string
}

const memory = perChat<LastSearch>('lastSearch', 'session')

export function rememberSearch(chatId: number, s: LastSearch) {
  memory.set(chatId, s.q.trim() || s.from != null || s.type ? { q: s.q.trim(), from: s.from, type: s.type } : undefined)
}

/** 打开搜索页的地址：有上次的搜索就带上它的条件 */
export function lastSearchPath(chatKey: string, chatId: number): string {
  const s = memory.get(chatId)
  return s ? paths.search(chatKey, s.q, s.from, s.type) : paths.search(chatKey)
}
