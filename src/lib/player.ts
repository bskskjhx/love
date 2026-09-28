import { create } from 'zustand'
import { chunkFor, dataUrl, getChunk, peekMeta, peekUsers } from './api'
import { userName } from './text'
import { getPrefs, setPrefs } from './prefs'
import type { Message } from './types'

export interface Track {
  chatId: number
  chatKey: string
  msg: Message
  name: string
}

interface PlayerState {
  track: Track | null
  playing: boolean
  time: number
  duration: number
  rate: number
}

const RATES = [1, 1.5, 2]

let audio: HTMLAudioElement | null = null
const usePlayerStore = create<PlayerState>(() => ({ track: null, playing: false, time: 0, duration: 0, rate: getPrefs().playbackRate }))
const get = usePlayerStore.getState

function isCurrent(t: Track) {
  const c = get().track
  return !!c && c.chatId === t.chatId && c.msg.id === t.msg.id
}

function set(patch: Partial<PlayerState>) {
  usePlayerStore.setState(patch)
}

function el(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'auto'
  audio.addEventListener('timeupdate', () => set({ time: audio!.currentTime }))
  audio.addEventListener('durationchange', () => set({ duration: Number.isFinite(audio!.duration) ? audio!.duration : get().duration }))
  audio.addEventListener('play', () => set({ playing: true }))
  audio.addEventListener('pause', () => set({ playing: false }))
  audio.addEventListener('ended', () => void onEnded())
  return audio
}

const titleOf = (t: Track) => {
  const m = t.msg.media
  if (m?.type === 'audio') return [m.performer, m.title].filter(Boolean).join(' - ') || m.name || '音频'
  return t.name || '语音消息'
}
export { titleOf as trackTitle }

function play(track: Track, at = 0) {
  const a = el()
  const file = track.msg.media?.file
  if (!file) return
  if (!isCurrent(track)) {
    a.src = dataUrl(file)
    set({ track, time: at, duration: track.msg.media?.dur ?? 0 })
  }
  a.playbackRate = get().rate
  if (at) a.currentTime = at
  void a.play().catch(() => set({ playing: false }))
  mediaSession(track)
}

export function toggle(track?: Track) {
  if (track && !isCurrent(track)) return play(track)
  const a = el()
  if (a.paused) void a.play().catch(() => {})
  else a.pause()
}

export function seek(frac: number, track?: Track) {
  const f = Math.min(1, Math.max(0, frac))
  if (track && !isCurrent(track)) {
    return play(track, f * (track.msg.media?.dur ?? 0))
  }
  const a = el()
  const d = Number.isFinite(a.duration) ? a.duration : get().duration
  if (d) {
    a.currentTime = f * d
    set({ time: a.currentTime })
  }
}

export function cycleRate() {
  const rate = RATES[(RATES.indexOf(get().rate) + 1) % RATES.length]
  if (audio) audio.playbackRate = rate
  setPrefs({ playbackRate: rate })
  set({ rate })
}

export function stop() {
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  set({ track: null, playing: false, time: 0, duration: 0 })
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
}

async function onEnded() {
  const t = get().track
  if (!t) return
  const kind = t.msg.media?.type
  const next = await findNext(t.chatId, t.msg.id, (m) => m.media?.type === kind && !!m.media?.file)
  if (next && get().track === t) play({ ...t, msg: next.msg, name: next.name ?? t.name })
  else set({ playing: false, time: 0 })
}

async function findNext(chatId: number, afterId: number, test: (m: Message) => boolean): Promise<{ msg: Message; name?: string } | null> {
  const meta = peekMeta(chatId)
  if (!meta) return null
  const start = chunkFor(meta.chunks, afterId)
  for (let n = start; n < Math.min(meta.chunks.length, start + 3); n++) {
    const msgs = await getChunk(chatId, n)
    const hit = msgs.find((m) => m.id > afterId && test(m))
    if (hit) {
      const users = peekUsers(chatId)
      return { msg: hit, name: users && hit.from != null ? userName(users, hit.from) : undefined }
    }
  }
  return null
}

function mediaSession(t: Track) {
  if (!('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  const m = t.msg.media
  ms.metadata = new MediaMetadata({ title: titleOf(t), artist: m?.type === 'audio' ? (m.performer ?? t.name) : '语音消息' })
  ms.setActionHandler('play', () => toggle())
  ms.setActionHandler('pause', () => toggle())
  ms.setActionHandler('seekto', (d) => d.seekTime != null && audio && (audio.currentTime = d.seekTime))
  ms.setActionHandler('nexttrack', () => void onEnded())
}

const IDLE: PlayerState = { track: null, playing: false, time: 0, duration: 0, rate: 1 }

export const usePlayer = () => usePlayerStore()

export function usePlayerFor(chatId: number, msgId: number): PlayerState {
  return usePlayerStore((state) => (state.track?.chatId === chatId && state.track.msg.id === msgId ? state : IDLE))
}
