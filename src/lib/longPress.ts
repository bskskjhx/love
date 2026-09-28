import { useRef } from 'react'
import { haptic } from './haptic'

/** 长按（触屏）或右键（桌面）弹出操作菜单 */
export function useLongPress(cb: (el: HTMLElement) => void) {
  const timer = useRef<number | undefined>(undefined)
  const start = useRef<[number, number]>([0, 0])
  const fired = useRef(false)
  const touching = useRef(false)
  const el = useRef<HTMLElement | null>(null)
  const clear = () => {
    window.clearTimeout(timer.current)
    el.current?.classList.remove('pressing')
  }
  const open = (target: HTMLElement) => {
    clear()
    if (touching.current && fired.current) return
    fired.current = true
    cb(target)
  }
  return {
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault()
      open(e.currentTarget)
    },
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
      clear()
      fired.current = false
      touching.current = true
      start.current = [e.touches[0].clientX, e.touches[0].clientY]
      el.current = e.currentTarget
      const target = e.currentTarget
      timer.current = window.setTimeout(() => {
        target.classList.add('pressing')
        timer.current = window.setTimeout(() => {
          haptic()
          open(target)
        }, 330)
      }, 150)
    },
    onTouchMove: (e: React.TouchEvent) => {
      const [x, y] = start.current
      if (Math.hypot(e.touches[0].clientX - x, e.touches[0].clientY - y) > 10) clear()
    },
    onTouchEnd: (e: React.TouchEvent) => {
      clear()
      touching.current = false
      if (fired.current) e.preventDefault()
    },
    onTouchCancel: () => {
      clear()
      touching.current = false
    },
  }
}
