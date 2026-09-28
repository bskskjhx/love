/**
 * iOS 27 式按压放大：给元素加 data-press 即可，按下时加 .is-pressed，松手弹回。
 * 与 :active 相比更适合手机：
 * - 触屏按下后稍等片刻再放大，手指一滑动（滚动列表/横滑标签）立即取消，不会一划就闪
 * - 快速轻点也保证放大持续一小段时间，反馈看得见
 * 全局只挂一组委托监听，列表再长也没有额外开销。
 */
const DELAY = 40
const MIN_SHOWN = 150
const SLOP = 10

interface Press {
  el: HTMLElement
  id: number
  x: number
  y: number
  shown: number
  timer: number
}

let cur: Press | null = null

function show(p: Press) {
  if (p.shown) return
  p.shown = performance.now()
  p.el.classList.add('is-pressed')
}

function cancel() {
  if (!cur) return
  window.clearTimeout(cur.timer)
  cur.el.classList.remove('is-pressed')
  cur = null
}

function release() {
  const p = cur
  if (!p) return
  cur = null
  window.clearTimeout(p.timer)
  show(p)
  const left = MIN_SHOWN - (performance.now() - p.shown)
  if (left <= 0) p.el.classList.remove('is-pressed')
  else window.setTimeout(() => p.el.classList.remove('is-pressed'), left)
}

export function installPress() {
  const opts = { capture: true, passive: true } as const
  document.addEventListener(
    'pointerdown',
    (e) => {
      cancel()
      if (e.button !== 0) return
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-press]')
      if (!el || el.matches(':disabled')) return
      const p: Press = { el, id: e.pointerId, x: e.clientX, y: e.clientY, shown: 0, timer: 0 }
      cur = p
      if (e.pointerType === 'mouse') show(p)
      else p.timer = window.setTimeout(() => show(p), DELAY)
    },
    opts,
  )
  document.addEventListener(
    'pointermove',
    (e) => {
      if (cur && e.pointerId === cur.id && Math.hypot(e.clientX - cur.x, e.clientY - cur.y) > SLOP) cancel()
    },
    opts,
  )
  document.addEventListener('pointerup', (e) => cur && e.pointerId === cur.id && release(), opts)
  // 浏览器接管为滚动时会发 pointercancel
  document.addEventListener('pointercancel', cancel, opts)
  document.addEventListener('scroll', cancel, opts)
}
