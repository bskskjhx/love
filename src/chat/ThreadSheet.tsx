import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { getMessage } from '../lib/api'
import { threadOf, type ReplyIndex } from '../lib/replies'
import type { ChatMeta, Message, Users } from '../lib/types'
import type { Item } from './grouping'
import { MessageItem, type ItemHandlers } from './MessageItem'

export function ThreadSheet({
  meta,
  users,
  index,
  root,
  onClose,
  onJump,
  handlers,
}: {
  meta: ChatMeta
  users: Users
  index: ReplyIndex | null
  root: number | null
  onClose: () => void
  onJump: (id: number) => void
  handlers: ItemHandlers
}) {
  const ids = useMemo(() => (root != null && index ? [root, ...threadOf(index, root)] : []), [root, index])
  const [msgs, setMsgs] = useState<Message[]>([])
  useEffect(() => {
    if (!ids.length) return
    let alive = true
    void Promise.all(ids.map((id) => getMessage(meta.id, meta.chunks, id))).then((list) => alive && setMsgs(list.filter((m): m is Message => !!m)))
    return () => {
      alive = false
    }
  }, [ids, meta])
  const items: Item[] = msgs.map((m, i) => ({ kind: 'msg', key: m.id, msgs: [m], first: i === 0 || msgs[i - 1].from !== m.from, last: true }))
  const inner: ItemHandlers = useMemo(() => ({ ...handlers, onContext: () => {}, onReplies: undefined }), [handlers])
  const n = ids.length - 1
  return (
    <Sheet open={root != null} onClose={onClose} title={n > 0 ? `${n} 条回复` : '回复'}>
      <div className="chat-bg mx-3 mb-4 overflow-hidden rounded-[var(--r-card)] py-2">
        {items.map((item, i) => (
          <div key={item.key}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                onClose()
                onJump(item.key)
              }}
              className="cursor-pointer"
            >
              <MessageItem item={item} users={users} chatId={meta.id} highlighted={false} {...inner} />
            </div>
            {i === 0 && n > 0 && (
              <div className="my-2 flex justify-center">
                <span className="glass-lite rounded-full px-3 py-1 text-[13px] font-medium text-label">{n} 条回复</span>
              </div>
            )}
          </div>
        ))}
        {!items.length && <div className="py-10 text-center text-[15px] text-label2">加载中…</div>}
      </div>
    </Sheet>
  )
}
