const root = document.documentElement
const vv = window.visualViewport

function update() {
  if (!vv) return
  const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
  root.style.setProperty('--kb', `${Math.round(kb > 60 ? kb : 0)}px`)
}

for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false })

vv?.addEventListener('resize', update)
vv?.addEventListener('scroll', update)
update()

export const isTouchScreen = () => matchMedia('(pointer: coarse)').matches

export const standalone =
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function blurActiveInput() {
  const el = document.activeElement
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.blur()
}
