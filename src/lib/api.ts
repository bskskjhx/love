import { queryClient } from './queryClient'
import type { ChatMeta, ChatSummary, ChunkInfo, Message, SiteIndex, Users } from './types'

const DATA = (import.meta.env.VITE_DATA_URL || import.meta.env.BASE_URL + 'data/').replace(/\/?$/, '/')

/** 存档内的相对路径 → 可访问的 URL */
export function dataUrl(rel: string): string {
  return DATA + rel.split('/').map(encodeURIComponent).join('/')
}

/** 某个存档 JSON 的查询：组件里用 useQuery(jsonQuery(rel))，其它地方用下面的 get*，共享同一份缓存（TanStack Query） */
export const jsonQuery = <T>(rel: string) => ({
  queryKey: ['archive', rel] as const,
  queryFn: async (): Promise<T> => {
    const r = await fetch(dataUrl(rel), { cache: 'no-cache' })
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return (await r.json()) as T
  },
})

const getJson = <T>(rel: string) => queryClient.fetchQuery(jsonQuery<T>(rel))
const peekJson = <T>(rel: string) => queryClient.getQueryData<T>(jsonQuery<T>(rel).queryKey)

export const getIndex = () => getJson<SiteIndex>('index.json')
export const getMeta = (chatId: number) => getJson<ChatMeta>(`chats/${chatId}/meta.json`)
export const getUsers = (chatId: number) => getJson<Users>(`chats/${chatId}/users.json`)
export const getChunk = (chatId: number, n: number) =>
  getJson<Message[]>(`chats/${chatId}/messages/${n}.json`).then((msgs) => withAnonSender(msgs, chatId))

export const peekMeta = (chatId: number) => peekJson<ChatMeta>(`chats/${chatId}/meta.json`)
export const peekUsers = (chatId: number) => peekJson<Users>(`chats/${chatId}/users.json`)
export function peekChunk(chatId: number, n: number): Message[] | undefined {
  const msgs = peekJson<Message[]>(`chats/${chatId}/messages/${n}.json`)
  return msgs && withAnonSender(msgs, chatId)
}

/** URL 中的群标识可以是数字 id 或 username（不区分大小写） */
function findChat(chats: ChatSummary[], key: string): ChatSummary | undefined {
  const lower = key.toLowerCase()
  return chats.find((c) => String(c.id) === key || c.username?.toLowerCase() === lower)
}

export function peekChat(key: string): ChatSummary | undefined {
  const index = peekJson<SiteIndex>('index.json')
  return index && findChat(index.chats, key)
}

/** 旧存档里超级群匿名管理员的消息没有 from：发送者就是群组本身 */
function withAnonSender(msgs: Message[], chatId: number): Message[] {
  if (chatId > 0) return msgs
  for (const m of msgs) {
    if (m.from == null && !m.svc) m.from = chatId
    const r = m.reply
    if (r && !r.ext && r.from == null && r.text != null) r.from = chatId
  }
  return msgs
}

export async function resolveChat(key: string): Promise<ChatSummary | undefined> {
  return findChat((await getIndex()).chats, key)
}

/** 找到包含（或最接近）某条消息 id 的块 */
export function chunkFor(chunks: ChunkInfo[], id: number): number {
  let lo = 0
  let hi = chunks.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (chunks[mid].max < id) lo = mid + 1
    else hi = mid
  }
  return Math.max(0, lo)
}

/** Telegram 原生链接 */
export function telegramLink(chat: ChatSummary, msgId?: number): string | undefined {
  const suffix = msgId ? `/${msgId}` : ''
  if (chat.username) return `https://t.me/${chat.username}${suffix}`
  if (chat.id < -1e12) return `https://t.me/c/${-chat.id - 1e12}${suffix || '/1'}`
  return undefined
}

/** 按 id 取单条消息（所在块会被缓存） */
export async function getMessage(chatId: number, chunks: ChunkInfo[], id: number): Promise<Message | undefined> {
  if (!chunks.length) return undefined
  const msgs = await getChunk(chatId, chunkFor(chunks, id))
  return msgs.find((m) => m.id === id)
}

export function prefetchChat(chatId: number) {
  void Promise.all([getMeta(chatId), getUsers(chatId)])
    .then(([meta]) => (meta.chunks.length ? getChunk(chatId, meta.chunks.length - 1) : undefined))
    .catch(() => {})
}
