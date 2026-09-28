import { Progress } from 'radix-ui'
import { useLayoutEffect } from 'react'
import { cycleRate, stop, toggle, trackTitle, usePlayer } from '../lib/player'
import { navigate, paths } from '../lib/router'
import { duration } from '../lib/format'
import { Close, Pause, Play } from './Icons'

export function MiniPlayer() {
  const st = usePlayer()
  const t = st.track
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--player-h', t ? '52px' : '0px')
  }, [t])
  if (!t) return null
  const frac = st.duration ? Math.min(1, st.time / st.duration) : 0
  const voice = t.msg.media?.type === 'voice'
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+var(--nav-h)+4px)] z-40 mx-auto max-w-3xl px-3">
      <div className="glass pointer-events-auto relative flex h-11 animate-pop items-center gap-1 overflow-hidden rounded-full pr-1 pl-1">
        <button type="button" data-press onClick={() => toggle()} aria-label={st.playing ? '暂停' : '播放'} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-accent">
          {st.playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          type="button"
          onClick={() => navigate(paths.chat(t.chatKey, t.msg.id))}
          className="flex min-w-0 flex-1 flex-col items-start px-1 text-left leading-tight"
          aria-label="回到这条消息"
        >
          <span className="w-full truncate text-[14px] font-semibold text-label">{trackTitle(t)}</span>
          <span className="text-[12px] text-label2 tabular-nums">
            {voice ? '语音消息' : t.msg.media?.performer || '音频'} · {duration(Math.round(st.time)) || '0:00'}
          </span>
        </button>
        <button type="button" data-press onClick={cycleRate} aria-label="播放倍速" className="h-8 shrink-0 rounded-full px-2 text-[13px] font-semibold text-label tabular-nums">
          {st.rate}×
        </button>
        <button type="button" data-press onClick={stop} aria-label="关闭播放器" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-label2">
          <Close size={16} />
        </button>
        <Progress.Root value={Math.round(frac * 100)} aria-label="播放进度" className="absolute inset-x-4 bottom-0 h-[2px] overflow-hidden rounded-full">
          <Progress.Indicator className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-200 ease-linear" style={{ transform: `scaleX(${frac})` }} />
        </Progress.Root>
      </div>
    </div>
  )
}
