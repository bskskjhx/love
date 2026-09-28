import { create } from 'zustand'

/** 列表是否正在滚动（滚动停止 150ms 后复位）；动画贴纸等据此暂停 */
const useScrollingStore = create(() => false)
let timer = 0

export function noteScroll() {
  if (!useScrollingStore.getState()) useScrollingStore.setState(true, true)
  window.clearTimeout(timer)
  timer = window.setTimeout(() => useScrollingStore.setState(false, true), 150)
}

export const useScrolling = () => useScrollingStore()
