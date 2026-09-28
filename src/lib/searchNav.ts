import { create } from 'zustand'

export interface SearchNavItem {
  id: number
  group?: string
}

export interface SearchNav {
  chatId: number
  items: SearchNavItem[]
  label: string
  path: string
  partial: boolean
}

const useSearchNavStore = create<SearchNav | null>(() => null)

export const setSearchNav = (nav: SearchNav | null) => useSearchNavStore.setState(nav, true)

export function useSearchNav(chatId: number): SearchNav | null {
  return useSearchNavStore((nav) => (nav?.chatId === chatId ? nav : null))
}

export function stepIndex(items: SearchNavItem[], from: number, dir: 1 | -1): number {
  const group = items[from]?.group
  let i = from + dir
  while (group && items[i]?.group === group) i += dir
  return i >= 0 && i < items.length ? i : -1
}
