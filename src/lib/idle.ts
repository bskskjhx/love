/**
 * 页面转场期间主线程要留给动画：非紧急的渲染工作（补齐消息窗口、后台搜索等）
 * 推迟到转场结束后的空闲时间再做，手机上点开页面不卡、动画不掉帧。
 */
let transitionEnd = 0

/** 转场动画时长（与 App 中 PageStack 的清理时间一致） */
const TRANSITION_MS = 600

export function markTransition() {
  transitionEnd = performance.now() + TRANSITION_MS
}

/** 转场结束后、浏览器空闲时执行；返回取消函数 */
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

/** 让出主线程，让浏览器先处理输入和绘制 */
export function yieldToMain(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (s?.yield) return s.yield()
  return new Promise((r) => setTimeout(r, 0))
}
