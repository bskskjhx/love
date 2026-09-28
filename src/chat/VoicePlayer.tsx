import { Slider } from 'radix-ui'
import { memo, type ReactNode } from 'react'
import { Music, Pause, Play } from '../components/Icons'
import { duration, fileSize } from '../lib/format'
import { cycleRate, seek, toggle, usePlayerFor, type Track } from '../lib/player'
import type { Media, Message } from '../lib/types'

const BARS = 40

function pseudoWave(id: number): number[] {
  let x = id * 2654435761
  return Array.from({ length: BARS }, (_, i) => {
    x = (x ^ (x << 13)) >>> 0
    x = (x ^ (x >>> 17)) >>> 0
    x = (x ^ (x << 5)) >>> 0
    return 6 + ((x % 22) * (0.55 + 0.45 * Math.sin((i / BARS) * Math.PI)))
  })
}

function resample(wave: number[]): number[] {
  if (wave.length === BARS) return wave
  return Array.from({ length: BARS }, (_, i) => wave[Math.min(wave.length - 1, Math.floor((i * wave.length) / BARS))])
}

function Bars({ wave }: { wave: number[] }) {
  return (
    <>
      {wave.map((v, i) => (
        <span key={i} className="w-[2.5px] shrink-0 rounded-full bg-current" style={{ height: `${Math.max(12, (v / 31) * 100)}%` }} />
      ))}
    </>
  )
}

const fmt = (s: number) => duration(Math.max(0, Math.round(s))) || '0:00'

export const VoicePlayer = memo(function VoicePlayer({ msg, media, chatId, chatKey, name }: { msg: Message; media: Media; chatId: number; chatKey: string; name: string }) {
  const st = usePlayerFor(chatId, msg.id)
  const current = st.track != null
  const dur = (current && st.duration) || media.dur || 0
  const frac = current && dur ? Math.min(1, st.time / dur) : 0
  const track: Track = { chatId, chatKey, msg, name }
  const voice = media.type === 'voice'
  const wave = voice ? resample(media.wave?.length ? media.wave : pseudoWave(msg.id)) : null

  const progress = (className: string, children: ReactNode) => (
    <Slider.Root
      value={[Math.round(frac * 1000)]}
      max={1000}
      step={1}
      disabled={!media.file}
      onValueChange={([v]) => seek(v / 1000, track)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`relative flex touch-none items-center select-none ${className}`}
    >
      <Slider.Track className="absolute inset-0">{children}</Slider.Track>
      <Slider.Thumb aria-label="播放进度" aria-valuetext={`${fmt(frac * dur)} / ${fmt(dur)}`} className="block h-full w-0 outline-none focus-visible:w-[3px] focus-visible:rounded-full focus-visible:bg-accent" />
    </Slider.Root>
  )

  const title = voice ? null : [media.performer, media.title].filter(Boolean).join(' - ') || media.name || '音频'
  return (
    <div className="my-0.5 flex w-[min(250px,60vw)] items-center gap-2.5">
      <button
        type="button"
        data-press
        disabled={!media.file}
        aria-label={st.playing ? '暂停' : '播放'}
        onClick={(e) => {
          e.stopPropagation()
          toggle(track)
        }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
      >
        {st.playing ? <Pause size={22} /> : voice || media.file ? <Play size={22} className="translate-x-[1px]" /> : <Music size={20} />}
      </button>
      <div className="min-w-0 flex-1">
        {title && <div className="truncate text-[15px] font-medium">{title}</div>}
        {wave ? (
          progress(
            'h-6',
            <>
              <div className="absolute inset-0 flex items-center gap-[2px] text-label3">
                <Bars wave={wave} />
              </div>
              <div className="absolute inset-0 flex items-center gap-[2px] text-accent transition-[clip-path] duration-200 ease-linear" style={{ clipPath: `inset(0 ${100 - frac * 100}% 0 0)` }}>
                <Bars wave={wave} />
              </div>
            </>,
          )
        ) : (
          progress(
            'my-1.5 h-[3px] rounded-full bg-label3',
            <div className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-accent transition-transform duration-200 ease-linear" style={{ transform: `scaleX(${frac})` }} />,
          )
        )}
        <div className="flex items-center gap-1.5 text-[12px] text-label2 tabular-nums">
          <span>{current ? `${fmt(st.time)} / ${fmt(dur)}` : fmt(dur)}</span>
          {!media.file ? <span>· {media.skip === 'size' ? `文件过大未存档${media.size ? `（${fileSize(media.size)}）` : ''}` : '未存档'}</span> : null}
          {current && (
            <button
              type="button"
              data-press
              onClick={(e) => {
                e.stopPropagation()
                cycleRate()
              }}
              className="ml-auto rounded-full bg-fill px-1.5 py-[1px] text-[11px] font-semibold text-label"
              aria-label="播放倍速"
            >
              {st.rate}×
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
