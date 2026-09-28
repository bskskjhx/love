import { useEffect, useSyncExternalStore } from 'react'
import { usePageActive } from './pageActive'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistStorage } from './store'

export type ThemePref = 'system' | 'light' | 'dark'

const media = matchMedia('(prefers-color-scheme: dark)')
const asPref = (v: unknown): ThemePref => (v === 'light' || v === 'dark' ? v : 'system')

const useThemeStore = create<{ pref: ThemePref }>()(persist(() => ({ pref: 'system' as ThemePref }), { name: 'theme', storage: persistStorage('local', (v) => ({ pref: asPref(v) })) }))
function apply() {
  const pref = useThemeStore.getState().pref
  const dark = pref === 'dark' || (pref === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media')
    m.setAttribute('content', dark ? '#161618' : '#f9f9f9')
  })
}

media.addEventListener('change', apply)
useThemeStore.subscribe(apply)
apply()

export function setTheme(t: ThemePref) {
  useThemeStore.setState({ pref: t })
}

export const useTheme = () => useThemeStore((s) => s.pref)

export function useDocumentTitle(title: string | undefined) {
  const active = usePageActive()
  useEffect(() => {
    if (active && title) document.title = title
  }, [title, active])
}


const clampTint = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0))
const useGlassStore = create<{ tint: number }>()(persist(() => ({ tint: 0.5 }), { name: 'glassTint', storage: persistStorage('local', (v) => ({ tint: clampTint(v) })) }))
const applyTint = () => document.documentElement.style.setProperty('--glass-tint', String(useGlassStore.getState().tint))
useGlassStore.subscribe(applyTint)
applyTint()

export function setGlassTint(v: number) {
  useGlassStore.setState({ tint: clampTint(v) })
}

export const useGlassTint = () => useGlassStore((s) => s.tint)

const darkListeners = new Set<() => void>()
new MutationObserver(() => darkListeners.forEach((l) => l())).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
export function useIsDark(): boolean {
  return useSyncExternalStore(
    (l) => {
      darkListeners.add(l)
      return () => darkListeners.delete(l)
    },
    () => document.documentElement.classList.contains('dark'),
  )
}
