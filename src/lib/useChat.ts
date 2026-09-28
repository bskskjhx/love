import { useQuery } from '@tanstack/react-query'
import { getMeta, getUsers, peekChat, peekMeta, peekUsers, resolveChat } from './api'
import { withChat } from './text'
import type { ChatMeta, Users } from './types'

interface ChatData {
  meta: ChatMeta
  users: Users
}

function cachedChat(chatKey: string): ChatData | undefined {
  const summary = peekChat(chatKey)
  const meta = summary && peekMeta(summary.id)
  const users = summary && peekUsers(summary.id)
  return meta && users ? { meta, users: withChat(users, meta) } : undefined
}

export function useChat(chatKey: string): { chat: ChatData | null; error: Error | null; retry: () => void } {
  const q = useQuery({
    queryKey: ['chat', chatKey],
    queryFn: async (): Promise<ChatData> => {
      const summary = await resolveChat(chatKey)
      if (!summary) throw new Error('找不到这个群聊')
      const [meta, users] = await Promise.all([getMeta(summary.id), getUsers(summary.id)])
      return { meta, users: withChat(users, meta) }
    },
    initialData: () => cachedChat(chatKey),
  })
  return { chat: q.data ?? null, error: !q.data && q.isError ? q.error : null, retry: () => void q.refetch() }
}
