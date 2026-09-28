import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog, VisuallyHidden } from 'radix-ui'
import { haptic } from '../lib/haptic'
import { AnimatePresence, usePresence } from 'motion/react'
import { useCloseWhenInactive } from '../lib/hooks'
import { mirrorLottie } from '../chat/LottieSticker'

export interface MenuAction {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
}

interface Placement {
  left: number
  top: number
  dy: number
  scale: number
}

const GAP = 10
const EDGE = 12
const SLIDE = 8
const TRACK_PAD = 28

function spring(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function reduced() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

const EXIT_MS = 360

export function ContextMenu({ target, groups, onClose }: { target: HTMLElement | null; groups: MenuAction[][]; onClose: () => void }) {
  return <AnimatePresence>{target != null && <Menu key="menu" target={target} groups={groups} onClose={onClose} />}</AnimatePresence>
}

function Menu({ target, groups, onClose }: { target: HTMLElement; groups: MenuAction[][]; onClose: () => void }) {
  const [open, safeToRemove] = usePresence()
  const closing = !open
  useEffect(() => {
    if (open) return
    const t = setTimeout(() => safeToRemove?.(), EXIT_MS)
    return () => clearTimeout(t)
  }, [open, safeToRemove])
  const view = { target, groups }

  const previewRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuEl, setMenuEl] = useState<HTMLDivElement | null>(null)
  const attachMenu = (el: HTMLDivElement | null) => {
    menuRef.current = el
    setMenuEl(el)
  }
  const insetRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const armed = useRef<string | null>(null)
  const stopMirror = useRef<(() => void) | null>(null)
  const hidden = useRef<HTMLElement | null>(null)
  const session = useRef(0)
  const openRef = useRef(open)
  openRef.current = open
  const reveal = () => {
    const el = hidden.current
    hidden.current = null
    if (el) el.style.opacity = ''
  }
  const conceal = (el: HTMLElement) => {
    if (hidden.current !== el) reveal()
    hidden.current = el
    el.style.opacity = '0'
  }
  const hot = useRef<HTMLElement | null>(null)
  const done = useRef(false)
  const groupsRef = useRef(groups)
  groupsRef.current = view.groups
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [origin, setOrigin] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [place, setPlace] = useState<Placement | null>(null)

  useCloseWhenInactive(open, onClose)

  const highlight = (el: HTMLElement | null, tick: boolean) => {
    const prev = hot.current
    if (el === prev) return
    prev?.classList.remove('hot')
    hot.current = el
    const pill = pillRef.current
    if (!pill) return
    const s = pill.style
    if (!el) {
      s.opacity = '0'
      return
    }
    el.classList.add('hot')
    if (tick) haptic()
    if (!prev) s.transition = 'none'
    s.width = `${el.offsetWidth}px`
    s.height = `${el.offsetHeight}px`
    s.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`
    if (!prev) {
      void pill.offsetWidth
      s.transition = ''
    }
    s.opacity = '1'
  }
  const highlightRef = useRef(highlight)
  highlightRef.current = highlight

  const fire = (label: string) => {
    if (done.current) return
    const a = groupsRef.current.flat().find((x) => x.label === label)
    if (!a) return
    done.current = true
    closeRef.current()
    a.onClick()
  }
  const fireRef = useRef(fire)
  fireRef.current = fire

  useEffect(() => {
    if (!open) return
    const itemAt = (x: number, y: number, pad: number) => {
      const menu = menuRef.current
      if (!menu) return null
      const r = menu.getBoundingClientRect()
      if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return null
      const scale = r.height / (menu.offsetHeight || 1) || 1
      const oy = (y - r.top) / scale
      let best: HTMLElement | null = null
      let bd = Infinity
      for (const it of menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) {
        const top = it.offsetTop
        const bottom = top + it.offsetHeight
        const d = oy < top ? top - oy : oy > bottom ? oy - bottom : 0
        if (d < bd) {
          bd = d
          best = it
        }
      }
      return best
    }
    let g: { id: number; x: number; y: number; live: boolean } | null = null
    const touchOf = (e: TouchEvent) => (g ? Array.from(e.changedTouches).find((t) => t.identifier === g!.id) : e.changedTouches[0])

    let frame = 0
    let point: [number, number] | null = null
    const flush = () => {
      frame = 0
      if (point && !done.current) highlightRef.current(itemAt(point[0], point[1], TRACK_PAD), true)
      point = null
    }
    const cancelFrame = () => {
      cancelAnimationFrame(frame)
      frame = 0
      point = null
    }

    const onStart = (e: TouchEvent) => {
      if (g || done.current) return
      const t = e.changedTouches[0]
      g = { id: t.identifier, x: t.clientX, y: t.clientY, live: true }
      highlightRef.current(itemAt(t.clientX, t.clientY, 0), false)
    }
    const onMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault()
      e.stopPropagation()
      if (done.current) return
      if (!g) {
        const t = e.changedTouches[0]
        g = { id: t.identifier, x: t.clientX, y: t.clientY, live: false }
      }
      const t = touchOf(e)
      if (!t) return
      if (!g.live) {
        if (Math.hypot(t.clientX - g.x, t.clientY - g.y) < SLIDE) return
        g.live = true
      }
      point = [t.clientX, t.clientY]
      if (!frame) frame = requestAnimationFrame(flush)
    }
    const onEnd = (e: TouchEvent) => {
      const t = touchOf(e)
      if (!g || !t) return
      const { live, x, y } = g
      g = null
      cancelFrame()
      const moved = Math.hypot(t.clientX - x, t.clientY - y) >= SLIDE
      const el = live ? itemAt(t.clientX, t.clientY, moved ? TRACK_PAD : 0) : null
      highlightRef.current(null, false)
      if (!el?.dataset.label) return
      e.preventDefault()
      fireRef.current(el.dataset.label)
    }
    const onCancel = () => {
      g = null
      cancelFrame()
      highlightRef.current(null, false)
    }

    let mouse: [number, number] | null = null
    let dragged = false
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || done.current) return
      if (!mouse) mouse = [e.clientX, e.clientY]
      else if (Math.hypot(e.clientX - mouse[0], e.clientY - mouse[1]) >= SLIDE) dragged = true
      highlightRef.current(itemAt(e.clientX, e.clientY, 0), false)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 2 || !dragged) return
      const el = itemAt(e.clientX, e.clientY, 0)
      if (el?.dataset.label) fireRef.current(el.dataset.label)
    }

    const opts = { passive: false, capture: true }
    window.addEventListener('touchstart', onStart, opts)
    window.addEventListener('touchmove', onMove, opts)
    window.addEventListener('touchend', onEnd, opts)
    window.addEventListener('touchcancel', onCancel, opts)
    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerup', onPointerUp, true)
    return () => {
      window.removeEventListener('touchstart', onStart, opts)
      window.removeEventListener('touchmove', onMove, opts)
      window.removeEventListener('touchend', onEnd, opts)
      window.removeEventListener('touchcancel', onCancel, opts)
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerup', onPointerUp, true)
      cancelFrame()
      highlightRef.current(null, false)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !target) return
    armed.current = null
    done.current = false
    const r = target.getBoundingClientRect()
    const t = getComputedStyle(target).transform
    const m = t && t !== 'none' ? new DOMMatrixReadOnly(t) : null
    const width = r.width / (m ? Math.hypot(m.a, m.b) || 1 : 1)
    const height = r.height / (m ? Math.hypot(m.c, m.d) || 1 : 1)
    setOrigin({ left: r.left + r.width / 2 - width / 2, top: r.top + r.height / 2 - height / 2, width, height })
    setPlace(null)
  }, [open, target])

  useLayoutEffect(() => {
    const src = view.target
    const box = previewRef.current
    const menu = menuRef.current
    if (!open || !src || !origin || !box || !menu || place) return
    const token = ++session.current
    if (hidden.current && hidden.current !== src) reveal()
    const clone = src.cloneNode(true) as HTMLElement
    clone.classList.remove('pressing')
    clone.style.margin = '0'
    clone.style.width = `${origin.width}px`
    clone.style.maxWidth = 'none'
    clone.style.transform = 'none'
    clone.style.animation = 'none'
    clone.style.transition = 'none'
    box.replaceChildren(clone)
    const srcCanvases = src.querySelectorAll('canvas')
    clone.querySelectorAll('canvas').forEach((c, i) => {
      const o = srcCanvases[i]
      if (o && o.width && o.height) c.getContext('2d')?.drawImage(o, 0, 0)
    })
    const srcVideos = src.querySelectorAll('video')
    const waiting: Promise<void>[] = []
    clone.querySelectorAll('video').forEach((v, i) => {
      const o = srcVideos[i]
      v.muted = true
      v.defaultMuted = true
      v.playsInline = true
      v.loop = o ? o.loop : true
      let still: HTMLCanvasElement | null = null
      if (o && o.videoWidth && o.readyState >= 2) {
        still = document.createElement('canvas')
        still.width = o.videoWidth
        still.height = o.videoHeight
        still.className = v.className
        try {
          still.getContext('2d')?.drawImage(o, 0, 0)
          const wrap = document.createElement('span')
          const cs = getComputedStyle(o)
          wrap.style.cssText = `position:relative;display:${cs.display === 'inline' ? 'inline-block' : cs.display};width:${o.offsetWidth}px;height:${o.offsetHeight}px;vertical-align:top`
          v.style.cssText += ';position:absolute;inset:0;width:100%;height:100%'
          still.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
          v.replaceWith(wrap)
          wrap.append(v, still)
        } catch {
          still = null
        }
      }
      if (o && o.readyState > 0) {
        try {
          v.currentTime = o.currentTime
        } catch {
          v.removeAttribute('data-sync')
        }
      }
      const shown = new Promise<void>((resolve) => {
        const ready = () => {
          still?.remove()
          resolve()
        }
        v.addEventListener('playing', ready, { once: true })
        v.addEventListener('error', () => resolve(), { once: true })
      })
      if (!still) waiting.push(shown)
      if (!o || !o.paused || o.loop) {
        void v.play().catch(() => {})
        v.addEventListener('canplay', () => v.paused && void v.play().catch(() => {}), { once: true })
      }
    })
    stopMirror.current?.()
    stopMirror.current = mirrorLottie(src, clone)
    const h = clone.getBoundingClientRect().height || origin.height
    box.style.height = `${h}px`
    if (waiting.length) {
      const hide = () => {
        if (session.current === token && openRef.current && box.isConnected) conceal(src)
      }
      void Promise.race([Promise.all(waiting), new Promise((r) => setTimeout(r, 400))]).then(hide)
    } else conceal(src)

    const inset = insetRef.current ? getComputedStyle(insetRef.current) : null
    const top = EDGE + (inset ? parseFloat(inset.paddingTop) : 0)
    const bottom = EDGE + (inset ? parseFloat(inset.paddingBottom) : 0)
    const leftEdge = EDGE + (inset ? parseFloat(inset.paddingLeft) : 0)
    const rightEdge = EDGE + (inset ? parseFloat(inset.paddingRight) : 0)
    const vw = window.innerWidth
    const vh = window.innerHeight
    const mh = menu.offsetHeight
    const mw = menu.offsetWidth
    const avail = vh - top - bottom
    let scale = 1.04
    if (h * scale + GAP + mh > avail) scale = Math.max(0.35, (avail - GAP - mh) / h)
    const ph = h * scale
    const natural = origin.top + (h - ph) / 2
    const visualTop = Math.min(Math.max(natural, top), vh - bottom - mh - GAP - ph)
    setPlace({
      left: Math.min(Math.max(origin.left, leftEdge), vw - mw - rightEdge),
      top: visualTop + ph + GAP,
      dy: visualTop - natural,
      scale,
    })
  }, [open, origin, place, view.target, menuEl])

  useLayoutEffect(() => {
    const box = previewRef.current
    if (!box || !place) return
    const to = `translateY(${place.dy}px) scale(${place.scale})`
    if (closing) {
      const back = box.animate([{ transform: to }, { transform: 'none' }], {
        duration: reduced() ? 1 : 320,
        easing: spring('--spring-smooth', 'ease-out'),
        fill: 'forwards',
      })
      const token = session.current
      back.finished
        .then(() => {
          if (session.current === token && !openRef.current) reveal()
        })
        .catch(() => {})
    } else {
      box.animate([{ transform: 'scale(0.97)' }, { transform: to }], {
        duration: reduced() ? 1 : 620,
        easing: spring('--spring-bouncy', 'ease-out'),
        fill: 'forwards',
      })
    }
  }, [place, closing])

  useEffect(
    () => () => {
      stopMirror.current?.()
      reveal()
    },
    [],
  )

  if (!origin) return null
  const run = (a: MenuAction, e: React.MouseEvent) => {
    if (e.detail !== 0 && armed.current !== a.label) return
    fire(a.label)
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && !closing && onClose()}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            menuRef.current?.focus()
          }}
          className={`fixed inset-0 z-50 touch-none select-none outline-none [-webkit-touch-callout:none] ${closing ? 'pointer-events-none' : ''}`}
          onContextMenu={(e) => e.preventDefault()}
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Title>消息操作</Dialog.Title>
          </VisuallyHidden.Root>
          <div ref={insetRef} aria-hidden className="pointer-events-none invisible absolute pt-[var(--safe-top)] pr-[var(--safe-right)] pb-[max(var(--safe-bottom),var(--kb))] pl-[var(--safe-left)]" />
          <div
            className={`menu-backdrop absolute inset-0 ${closing ? 'animate-fade-out' : 'animate-fade'}`}
            onPointerDown={() => (armed.current = 'backdrop')}
            onClick={() => armed.current === 'backdrop' && onClose()}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div
            ref={previewRef}
            aria-hidden
            className="pointer-events-none absolute origin-center"
            style={{ left: origin.left, top: origin.top, width: origin.width, height: origin.height, filter: 'drop-shadow(0 10px 30px rgb(0 0 0 / 0.18))' }}
          />
          <div
            ref={attachMenu}
            role="menu"
            tabIndex={-1}
            className={`glass-sheet absolute w-[250px] max-w-[calc(100vw-24px)] origin-top-left overflow-hidden rounded-[26px] p-1.5 ${place ? (closing ? 'animate-menu-out' : 'animate-menu-in') : 'invisible'}`}
            style={place ? { left: place.left, top: place.top } : { left: 0, top: 0 }}
            onPointerLeave={(e) => e.pointerType === 'mouse' && highlight(null, false)}
          >
            <div ref={pillRef} aria-hidden className="menu-hl pointer-events-none absolute top-0 left-0 rounded-[18px] opacity-0" />
            {view.groups.map((g, gi) => (
              <div key={gi} className={gi ? 'mt-1.5 border-t-[0.5px] border-sep pt-1.5' : ''}>
                {g.map((a) => (
                  <button
                    key={a.label}
                    role="menuitem"
                    data-label={a.label}
                    onPointerDown={() => (armed.current = a.label)}
                    onClick={(e) => run(a, e)}
                    className={`menu-item relative flex h-11 w-full items-center gap-3 rounded-[18px] px-3.5 text-left text-[16px] ${a.danger ? 'text-danger' : 'text-label'}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{a.label}</span>
                    {a.icon && <span className="shrink-0 opacity-90">{a.icon}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
