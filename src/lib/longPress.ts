import { useRef } from 'react'
import { LongPressEventType, useLongPress as useLibLongPress } from 'use-long-press'
import { haptic } from './haptic'

export function useLongPress(cb: (el: HTMLElement) => void) {
  const el = useRef<HTMLElement | null>(null)
  const touching = useRef(false)
  const fired = useRef(false)
  const release = () => {
    touching.current = false
    el.current?.classList.remove('pressing')
  }
  const handlers = useLibLongPress<HTMLElement>(
    () => {
      fired.current = true
      el.current?.classList.remove('pressing')
      haptic()
      if (el.current) cb(el.current)
    },
    {
      threshold: 480,
      detect: LongPressEventType.Touch,
      cancelOnMovement: 10,
      onStart: (e) => {
        el.current = e.currentTarget
        touching.current = true
        fired.current = false
        e.currentTarget.classList.add('pressing')
      },
      onFinish: release,
      onCancel: release,
    },
  )()
  return {
    ...handlers,
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => {
      handlers.onTouchEnd(e)
      if (fired.current) e.preventDefault()
    },
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault()
      if (!touching.current) cb(e.currentTarget)
    },
  }
}
