export function blockNativeMenu() {
  window.addEventListener(
    'contextmenu',
    (e) => {
      const t = e.target as Element | null
      if (t?.closest?.('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
    },
    { capture: true },
  )
  window.addEventListener('dragstart', (e) => {
    const t = e.target as Element | null
    if (t instanceof HTMLImageElement || t instanceof HTMLAnchorElement) e.preventDefault()
  })
}
