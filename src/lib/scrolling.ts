import { create } from 'zustand'

const useScrollingStore = create(() => false)
let timer = 0

export function noteScroll() {
  if (!useScrollingStore.getState()) useScrollingStore.setState(true, true)
  window.clearTimeout(timer)
  timer = window.setTimeout(() => useScrollingStore.setState(false, true), 150)
}

export const useScrolling = () => useScrollingStore()
