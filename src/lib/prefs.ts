import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistStorage } from './store'

interface Prefs {
  fontStep: number
  wallpaper: string
  autoplayGif: boolean
  autoplayVideo: boolean
  autoplayStickers: boolean
  dataSaver: boolean
  playbackRate: number
  pinnedChats: number[]
}

export const FONT_SIZES = [13, 14, 16, 17, 18, 20, 22]

export const WALLPAPERS: { key: string; label: string; light: string; dark: string; pattern?: boolean }[] = [
  { key: 'default', label: '默认', light: 'linear-gradient(160deg, #d9e6cf 0%, #c3d9c4 45%, #d9e2c3 100%)', dark: 'linear-gradient(160deg, #0d1512 0%, #0b0f14 50%, #121212 100%)' },
  { key: 'blue', label: '晴空', light: 'linear-gradient(160deg, #cfe3f6 0%, #a8c8ea 50%, #d6e6f5 100%)', dark: 'linear-gradient(160deg, #0e1621 0%, #17212b 60%, #0f1923 100%)', pattern: true },
  { key: 'peach', label: '蜜桃', light: 'linear-gradient(160deg, #fde7d6 0%, #f7c9b6 55%, #fbe0cf 100%)', dark: 'linear-gradient(160deg, #2a1a14 0%, #1a1210 60%, #221512 100%)', pattern: true },
  { key: 'lilac', label: '丁香', light: 'linear-gradient(160deg, #e8def8 0%, #cfc1ef 55%, #e2d8f5 100%)', dark: 'linear-gradient(160deg, #1d1728 0%, #120f1a 60%, #1a1424 100%)', pattern: true },
  { key: 'mint', label: '薄荷', light: 'linear-gradient(160deg, #d9f3eb 0%, #b8e3d4 55%, #d3efe4 100%)', dark: 'linear-gradient(160deg, #0f1f1a 0%, #0b1512 60%, #10201b 100%)', pattern: true },
  { key: 'plain', label: '纯色', light: '#e9e9ee', dark: '#000000' },
]

const PATTERN = (color: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' fill='none' stroke='${color}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>` +
      `<path d='M30 28l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z'/><path d='M128 30c-6-8-18-2-14 7 2 5 14 12 14 12s12-7 14-12c4-9-8-15-14-7z'/>` +
      `<circle cx='92' cy='92' r='11'/><path d='M22 120l14-22 14 22z'/><path d='M140 118q10-14 20 0t20 0'/><rect x='70' y='145' width='20' height='20' rx='5'/>` +
      `<path d='M150 160l8-8m0 8l-8-8'/><path d='M60 60q6-10 12 0'/></svg>`,
  )}")`

const DEFAULTS: Prefs = {
  fontStep: 2,
  wallpaper: 'default',
  autoplayGif: true,
  autoplayVideo: true,
  autoplayStickers: true,
  dataSaver: false,
  playbackRate: 1,
  pinnedChats: [],
}

const usePrefsStore = create<Prefs>()(persist(() => DEFAULTS, { name: 'prefs', storage: persistStorage('local', (v) => ({ ...DEFAULTS, ...(v as Partial<Prefs>) })) }))
usePrefsStore.subscribe(apply)
apply()

function apply() {
  const prefs = usePrefsStore.getState()
  const size = FONT_SIZES[prefs.fontStep] ?? 16
  const root = document.documentElement.style
  root.setProperty('--msg-size', `${size}px`)
  root.setProperty('--msg-scale', String(size / 16))
  const wp = WALLPAPERS.find((w) => w.key === prefs.wallpaper) ?? WALLPAPERS[0]
  root.setProperty('--wp-light', wp.light)
  root.setProperty('--wp-dark', wp.dark)
  root.setProperty('--wp-pattern-light', wp.pattern ? PATTERN('rgba(0,0,0,0.07)') : 'none')
  root.setProperty('--wp-pattern-dark', wp.pattern ? PATTERN('rgba(255,255,255,0.05)') : 'none')
}

export const getPrefs = usePrefsStore.getState

export function setPrefs(patch: Partial<Prefs>) {
  usePrefsStore.setState(patch)
}

export const usePrefs = () => usePrefsStore()
