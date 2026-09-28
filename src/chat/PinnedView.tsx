import { AnimatePresence, usePresence } from 'motion/react'
import { Dialog } from 'radix-ui'
import { Fragment, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ArrowRight } from '../components/Icons'
import { NavBar } from '../components/NavBar'
import { Spinner } from '../components/States'
import { getMessage } from '../lib/api'
import { dayLabel } from '../lib/format'
import type { ChatMeta, Message, Users } from '../lib/types'
import { groupMessages } from './grouping'
import { MessageItem, type ItemHandlers } from './MessageItem'

const PAGE = 20

interface Props {
  open: boolean
  meta: ChatMeta
  users: Users
  pins: number[]
  handlers: ItemHandlers
  onClose: () => void
  onGo: (id: number) => void
}

const EXIT_MS = 520

export function PinnedView({ open, ...rest }: Props) {
  return <AnimatePresence>{open && <PinnedPage key="pinned" {...rest} />}</AnimatePresence>
}

function PinnedPage({ meta, users, pins, handlers, onClose, onGo }: Omit<Props, 'open'>) {
  const [open, safeToRemove] = usePresence()
  const closing = !open
  useEffect(() => {
    if (open) return
    const t = setTimeout(() => safeToRemove?.(), EXIT_MS)
    return () => clearTimeout(t)
  }, [open, safeToRemove])
  const ordered = useMemo(() => [...pins].sort((a, b) => a - b), [pins])
  const [shown, setShown] = useState(PAGE)
  const [msgs, setMsgs] = useState<Map<number, Message | null>>(() => new Map())

  useLayoutEffect(() => {
    if (open) {
      setShown(PAGE)
    }
  }, [open])

  const ids = useMemo(() => ordered.slice(-shown), [ordered, shown])

  useEffect(() => {
    let alive = true
    const missing = ids.filter((id) => !msgs.has(id))
    if (!missing.length) return
    void Promise.all(missing.map((id) => getMessage(meta.id, meta.chunks, id).catch(() => undefined))).then((list) => {
      if (!alive) return
      setMsgs((cur) => {
        const next = new Map(cur)
        missing.forEach((id, k) => next.set(id, list[k] ?? null))
        return next
      })
    })
    return () => {
      alive = false
    }
  }, [ids, meta, msgs])

  const loaded = useMemo(() => ids.map((id) => msgs.get(id)).filter((m): m is Message => !!m), [ids, msgs])
  const days = useMemo(() => groupMessages(loaded), [loaded])
  const ready = loaded.length > 0 && ids.every((id) => msgs.has(id))

  const live = useMemo<ItemHandlers>(
    () => ({
      ...handlers,
      onJump: (id, source) => {
        onClose()
        handlers.onJump(id, source)
      },
    }),
    [handlers, onClose],
  )

  const more = shown < ordered.length

  return (
    <Dialog.Root open modal={false} onOpenChange={(o) => !o && !closing && onClose()}>
      <Dialog.Content
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className={`pinned-view chat-bg page-front absolute inset-0 z-40 outline-none ${closing ? 'pinned-closing pointer-events-none animate-page-pop-out' : 'animate-page-push-in'}`}
      >
        <Dialog.Title className="sr-only">{`${pins.length} 条置顶消息`}</Dialog.Title>
        <NavBar capsule back={{ label: '聊天', onClick: onClose }} title={`${pins.length} 条置顶消息`} />
        <div
          onScroll={(e) => {
            const el = e.currentTarget
            if (more && ready && el.scrollHeight - el.clientHeight - Math.abs(el.scrollTop) < 600) setShown((n) => Math.min(ordered.length, n + PAGE))
          }}
          className="scroller absolute inset-0 flex flex-col-reverse pt-[calc(var(--safe-top)+var(--nav-h))] pb-[calc(var(--safe-bottom)+16px)]"
        >
          {!ready && !loaded.length ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl">
              {more && (
                <div className="flex h-14 items-center justify-center">
                  <Spinner />
                </div>
              )}
              {days.map((day) => (
                <section key={day.key + day.items[0].key}>
                  <div className="flex justify-center py-1.5">
                    <span className="glass-lite rounded-full px-3 py-1 text-[13px] font-medium text-label">{dayLabel(day.ts)}</span>
                  </div>
                  {day.items.map((item) => (
                    <Fragment key={item.key}>
                      <div className="flex items-end gap-1 pr-2">
                        <div className="min-w-0 flex-1">
                          <MessageItem item={item} users={users} chatId={meta.id} highlighted={false} {...live} />
                        </div>
                        {item.kind === 'msg' && (
                          <button
                            type="button"
                            data-press
                            onClick={() => onGo(item.key)}
                            aria-label="在聊天中查看"
                            className="glass glass-press mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-accent"
                          >
                            <ArrowRight size={20} />
                          </button>
                        )}
                      </div>
                    </Fragment>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
