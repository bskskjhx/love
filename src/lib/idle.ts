let transitionEnd = 0

const TRANSITION_MS = 600

export function markTransition() {
  transitionEnd = performance.now() + TRANSITION_MS
}

export function afterTransition(cb: () => void, timeout = 250): () => void {
  let idle = 0
  let timer = 0
  const schedule = () => {
    const wait = transitionEnd - performance.now()
    if (wait > 0) {
      timer = window.setTimeout(schedule, wait)
      return
    }
    if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(cb, { timeout })
    else timer = window.setTimeout(cb, 16)
  }
  schedule()
  return () => {
    window.clearTimeout(timer)
    if (idle) cancelIdleCallback(idle)
  }
}

export function yieldToMain(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (s?.yield) return s.yield()
  return new Promise((r) => setTimeout(r, 0))
}
