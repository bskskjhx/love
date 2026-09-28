import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { RowsPhotoAlbum, type Photo as AlbumItem } from 'react-photo-album'
import 'react-photo-album/rows.css'
import { useInView } from '../lib/hooks'
import { usePrefs } from '../lib/prefs'
import { dataUrl } from '../lib/api'
import { duration, fileSize } from '../lib/format'
import type { Media, Message } from '../lib/types'
import { Download, FileIcon, Pin, Play } from '../components/Icons'
import { RichText } from './RichText'
import { VoicePlayer } from './VoicePlayer'
import { LottieSticker } from './LottieSticker'

export const MEDIA_MAX_W = 320

export function fitBox(w = 1, h = 1, maxW = MEDIA_MAX_W, maxH = 400, minW = 150): { w: number; h: number } {
  let W = maxW
  let H = (W * h) / w
  if (H > maxH) {
    H = maxH
    W = (H * w) / h
  }
  if (W < minW) W = minW
  return { w: Math.round(W), h: Math.round(H) }
}

function boxStyle(box: { w: number; h: number }): CSSProperties {
  return { width: `min(${box.w}px, 68vw)`, aspectRatio: `${box.w} / ${box.h}` }
}

export function isVisual(m?: Media): boolean {
  return !!m && (m.type === 'photo' || m.type === 'video' || m.type === 'gif')
}

export function isBare(m?: Media): boolean {
  return !!m && (m.type === 'sticker' || m.type === 'round' || m.type === 'dice')
}

function skipReason(m: Media): string {
  if (m.skip === 'size') return `文件过大未存档${m.size ? `（${fileSize(m.size)}）` : ''}`
  if (m.skip === 'error') return '下载失败'
  return '未存档'
}

function Placeholder({ media, box, label, children }: { media: Media; box: { w: number; h: number }; label: string; children?: ReactNode }) {
  return (
    <div className="relative flex items-center justify-center overflow-hidden bg-fill2 text-label2" style={boxStyle(box)}>
      {media.thumb && <img src={dataUrl(media.thumb)} alt="" className="absolute inset-0 h-full w-full object-cover blur-sm" />}
      <div className="relative z-10 flex flex-col items-center gap-1 rounded-xl bg-black/45 px-3 py-2 text-center text-[13px] text-white">
        {children}
        <span>{label}</span>
      </div>
    </div>
  )
}

export function Photo({ msg, onOpen, box }: { msg: Message; onOpen?: (id: number) => void; box?: { w: number; h: number }; }) {
  const media = msg.media!
  const b = box ?? fitBox(media.w, media.h)
  const [revealed, setRevealed] = useState(!media.spoiler)
  const { dataSaver } = usePrefs()
  const [load, setLoad] = useState(false)
  if (!media.file) return <Placeholder media={media} box={b} label={`图片${skipReason(media)}`} />
  if (dataSaver && !load) {
    return (
      <button
        type="button"
        className="relative block overflow-hidden"
        style={box ? { width: '100%', height: '100%' } : boxStyle(b)}
        onClick={(e) => {
          e.stopPropagation()
          setLoad(true)
        }}
        aria-label="加载图片"
      >
        <SaverCover media={media} />
      </button>
    )
  }
  return (
    <button
      type="button"
      className="relative block overflow-hidden bg-fill"
      style={box ? { width: '100%', height: '100%' } : boxStyle(b)}
      onClick={(e) => {
        e.stopPropagation()
        if (!revealed) setRevealed(true)
        else onOpen?.(msg.id)
      }}
      aria-label="查看图片"
    >
      <img
        src={dataUrl(media.file)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={`h-full w-full object-cover transition-[filter] duration-300 ${revealed ? '' : 'scale-110 blur-2xl'}`}
      />
      {!revealed && <span className="absolute inset-0 flex items-center justify-center text-[15px] font-medium text-white">点击查看</span>}
    </button>
  )
}

function SaverCover({ media, label }: { media: Media; label?: string }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-fill2">
      {media.thumb && <img src={dataUrl(media.thumb)} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md" />}
      <span className="relative flex flex-col items-center gap-1 rounded-2xl bg-black/45 px-3 py-2 text-[12px] text-white">
        <Download size={22} />
        {label ?? (media.size ? fileSize(media.size) : '点按加载')}
      </span>
    </span>
  )
}

type AlbumPhoto = AlbumItem & { msg: Message }

const clampRatio = (w = 1, h = 1) => Math.min(2, Math.max(0.5, w / h))

export function Album({ msgs, onOpen }: { msgs: Message[]; onOpen: (id: number) => void }) {
  const photos = useMemo<AlbumPhoto[]>(
    () => msgs.map((m) => ({ key: String(m.id), src: m.media?.file ?? '', width: Math.round(clampRatio(m.media?.w, m.media?.h) * 1000), height: 1000, msg: m })),
    [msgs],
  )
  return (
    <div style={{ width: `min(${MEDIA_MAX_W}px, 68vw)` }}>
      <RowsPhotoAlbum
        photos={photos}
        spacing={2}
        padding={0}
        defaultContainerWidth={Math.min(MEDIA_MAX_W, Math.round(window.innerWidth * 0.68))}
        targetRowHeight={(w) => w / 2.4}
        rowConstraints={{ maxPhotos: 3, singleRowMaxHeight: 260 }}
        render={{
          image: ({ className, style }, { photo }) => (
            <div className={`${className} overflow-hidden`} style={style}>
              <MediaTile msg={photo.msg} onOpen={onOpen} />
            </div>
          ),
        }}
      />
    </div>
  )
}

function MediaTile({ msg, onOpen }: { msg: Message; onOpen: (id: number) => void }) {
  const media = msg.media
  if (media?.type === 'photo') return <Photo msg={msg} onOpen={onOpen} box={{ w: 100, h: 100 }} />
  if (media?.type === 'video' || media?.type === 'gif') return <Video media={media} fill />
  return <div className="h-full w-full bg-fill2" />
}

function Video({ media, fill }: { media: Media; fill?: boolean }) {
  const [playing, setPlaying] = useState(false)
  const prefs = usePrefs()
  const [load, setLoad] = useState(false)
  const [viewRef, inView] = useInView<HTMLElement>()
  const b = fitBox(media.w || 16, media.h || 9)
  const style = fill ? { width: '100%', height: '100%' } : boxStyle(b)
  const gif = media.type === 'gif'
  if (!media.file) {
    if (fill) return <div className="h-full w-full bg-fill2" />
    return (
      <Placeholder media={media} box={b} label={`${gif ? 'GIF' : '视频'}${skipReason(media)}`}>
        {media.dur ? <span className="text-[12px] opacity-80">{duration(media.dur)}</span> : null}
      </Placeholder>
    )
  }
  const src = dataUrl(media.file)
  const poster = media.thumb ? dataUrl(media.thumb) : undefined
  const auto = !prefs.dataSaver && (gif ? prefs.autoplayGif : prefs.autoplayVideo)
  if (gif && (auto || load)) {
    return <AutoVideo src={src} poster={poster} style={style} active={inView} viewRef={viewRef} />
  }
  if (gif) {
    return (
      <button type="button" ref={viewRef} onClick={(e) => { e.stopPropagation(); setLoad(true) }} className="relative block overflow-hidden bg-black" style={style} aria-label="播放 GIF">
        {poster ? <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" /> : prefs.dataSaver ? <SaverCover media={media} label="GIF" /> : <video src={src + '#t=0.1'} preload="metadata" muted playsInline className="h-full w-full object-cover" />}
        <span className="absolute top-1.5 left-1.5 rounded-full bg-black/50 px-1.5 text-[12px] font-semibold text-white">GIF</span>
      </button>
    )
  }
  if (playing) {
    return <video src={src} poster={poster} autoPlay controls playsInline className="block bg-black object-contain" style={style} onClick={(e) => e.stopPropagation()} />
  }
  return (
    <button type="button" ref={viewRef} onClick={(e) => { e.stopPropagation(); setPlaying(true) }} className="relative block overflow-hidden bg-black" style={style} aria-label="播放视频">
      {auto && inView ? (
        <video src={src} poster={poster} autoPlay loop muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : poster ? (
        <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : prefs.dataSaver ? (
        <SaverCover media={media} />
      ) : (
        <video src={src + '#t=0.1'} preload="metadata" muted playsInline className="h-full w-full object-cover" />
      )}
      <span className="absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
        <Play size={24} />
      </span>
      {media.dur ? <span className="absolute top-1.5 left-1.5 rounded-full bg-black/50 px-1.5 text-[12px] text-white">{duration(media.dur)}</span> : null}
    </button>
  )
}

function AutoVideo({ src, poster, style, active, viewRef, className = 'block bg-black object-cover' }: { src: string; poster?: string; style?: CSSProperties; active: boolean; viewRef: (el: HTMLElement | null) => void; className?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const setRef = useCallback(
    (el: HTMLVideoElement | null) => {
      ref.current = el
      viewRef(el)
    },
    [viewRef],
  )
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (active) void v.play().catch(() => {})
    else v.pause()
  }, [active])
  return (
    <video
      ref={setRef}
      src={src}
      poster={poster}
      loop
      muted
      playsInline
      preload="metadata"
      className={className}
      style={style}
    />
  )
}

function VideoSticker({ src, emoji, active, viewRef }: { src: string; emoji?: string; active: boolean; viewRef: (el: HTMLElement | null) => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const v = ref.current
    if (!v || !ready) return
    if (active) void v.play().catch(() => {})
    else v.pause()
  }, [active, ready])
  return (
    <div ref={viewRef} className="relative h-40 w-40" title="贴纸" aria-label={emoji ? `${emoji} 贴纸` : '贴纸'}>
      {(!ready || failed) && <span className="absolute inset-0 flex items-center justify-center text-[88px] leading-none">{emoji || '🖼️'}</span>}
      {!failed && (
        <video
          ref={ref}
          src={src}
          loop
          muted
          playsInline
          preload="auto"
          onLoadedData={() => setReady(true)}
          onError={() => setFailed(true)}
          className={`h-40 w-40 object-contain ${ready ? '' : 'opacity-0'}`}
        />
      )}
    </div>
  )
}

function Sticker({ media }: { media: Media }) {
  const { autoplayStickers } = usePrefs()
  const [viewRef, inView] = useInView<HTMLElement>()
  if (media.file && !media.animated) {
    const src = dataUrl(media.file)
    if (media.mime === 'video/webm' || media.file.endsWith('.webm'))
      return <VideoSticker src={src} emoji={media.emoji} active={inView && autoplayStickers} viewRef={viewRef} />
    return <img src={src} alt={media.emoji} loading="lazy" className="h-40 w-40 object-contain" draggable={false} />
  }
  if (media.file && media.animated) return <LottieSticker file={media.file} emoji={media.emoji} />
  return (
    <div className="flex h-32 w-32 items-center justify-center text-[88px] leading-none" title="贴纸">
      {media.emoji || '🖼️'}
    </div>
  )
}

function Round({ media }: { media: Media }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  if (!media.file)
    return (
      <div className="flex h-48 w-48 flex-col items-center justify-center rounded-full bg-fill2 text-center text-[13px] text-label2">
        视频消息
        <br />
        {skipReason(media)}
      </div>
    )
  return (
    <button
      type="button"
      className="relative h-48 w-48 overflow-hidden rounded-full bg-black"
      onClick={(e) => {
        e.stopPropagation()
        const v = ref.current
        if (!v) return
        if (v.paused) {
          v.muted = false
          void v.play()
          setPlaying(true)
        } else {
          v.pause()
          setPlaying(false)
        }
      }}
    >
      <video ref={ref} src={dataUrl(media.file)} poster={media.thumb ? dataUrl(media.thumb) : undefined} playsInline preload="metadata" className="h-full w-full object-cover" onEnded={() => setPlaying(false)} />
      {!playing && (
        <span className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white">
          <Play size={22} />
        </span>
      )}
    </button>
  )
}

function FileRow({ media }: { media: Media }) {
  const inner = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white">{media.file ? <Download size={20} /> : <FileIcon size={20} />}</span>
      <div className="min-w-0 text-left">
        <div className="truncate text-[15px] font-medium text-label">{media.name || '文件'}</div>
        <div className="text-[13px] text-label2">
          {fileSize(media.size)}
          {!media.file && ` · ${skipReason(media)}`}
        </div>
      </div>
    </>
  )
  if (!media.file) return <div className="my-0.5 flex w-[min(260px,62vw)] items-center gap-2.5">{inner}</div>
  return (
    <a href={dataUrl(media.file)} download={media.name} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="my-0.5 flex w-[min(260px,62vw)] items-center gap-2.5 no-underline">
      {inner}
    </a>
  )
}

export function WebPage({ media }: { media: Media }) {
  if (!media.title && !media.desc && !media.site) return null
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className="mt-1.5 block rounded-md border-l-[3px] border-accent bg-accent/10 py-1 pr-2 pl-2 text-[14px] leading-snug no-underline"
    >
      {media.site && <div className="font-semibold text-accent">{media.site}</div>}
      {media.title && <div className="font-semibold text-label">{media.title}</div>}
      {media.desc && <div className="line-clamp-4 text-label">{media.desc}</div>}
    </a>
  )
}

function Poll({ media }: { media: Media }) {
  const p = media.poll
  if (!p) return null
  const total = p.total ?? p.opts.reduce((a, o) => a + (o.n ?? 0), 0)
  const max = Math.max(1, ...p.opts.map((o) => o.n ?? 0))
  return (
    <div className="w-[min(280px,64vw)] py-0.5">
      <div className="text-[15px] font-semibold">
        <RichText text={p.q} />
      </div>
      <div className="mb-2 text-[13px] text-label2">
        {p.quiz ? '测验' : '投票'}
        {p.closed ? ' · 已结束' : ''}
      </div>
      <div className="flex flex-col gap-2">
        {p.opts.map((o, i) => {
          const pct = total ? Math.round(((o.n ?? 0) / total) * 100) : 0
          return (
            <div key={i} className="text-[15px]">
              <div className="flex gap-2">
                <span className="w-9 shrink-0 text-right text-[13px] font-semibold">{o.n != null ? `${pct}%` : ''}</span>
                <span className="min-w-0 flex-1">{o.t}</span>
              </div>
              <div className="mt-1 ml-11 h-[3px] rounded-full bg-accent" style={{ width: `calc(${((o.n ?? 0) / max) * 100}% - 2.75rem)`, minWidth: 4 }} />
            </div>
          )
        })}
      </div>
      <div className="mt-2 text-[13px] text-label2">{total} 人参与</div>
    </div>
  )
}

function Geo({ media }: { media: Media }) {
  const { lat, lng } = media
  const href = lat != null && lng != null ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}` : undefined
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="my-0.5 flex w-[min(260px,62vw)] items-center gap-2.5 no-underline">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#34c759] text-white">
        <Pin size={20} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-medium text-label">{media.title || '位置'}</div>
        <div className="truncate text-[13px] text-label2">{media.address || (lat != null ? `${lat.toFixed(5)}, ${lng?.toFixed(5)}` : '')}</div>
      </div>
    </a>
  )
}

export function MediaBody({ msg, chatId = 0, name = '' }: { msg: Message; chatId?: number; name?: string }) {
  const media = msg.media
  if (!media) return null
  switch (media.type) {
    case 'video':
    case 'gif':
      return <Video media={media} />
    case 'sticker':
      return <Sticker media={media} />
    case 'round':
      return <Round media={media} />
    case 'voice':
    case 'audio':
      return <VoicePlayer msg={msg} media={media} chatId={chatId} chatKey={String(chatId)} name={name} />
    case 'file':
      return <FileRow media={media} />
    case 'poll':
      return <Poll media={media} />
    case 'geo':
    case 'venue':
      return <Geo media={media} />
    case 'contact':
      return <div className="text-[15px]">👤 {media.name || '联系人'}</div>
    case 'dice':
      return (
        <div className="flex flex-col items-center">
          <span className="text-[72px] leading-none">{media.emoji}</span>
          <span className="mt-1 rounded-full bg-black/25 px-2 text-[12px] text-white">{media.value}</span>
        </div>
      )
    case 'game':
      return <div className="text-[15px] text-label2">🎮 {media.title}</div>
    case 'invoice':
      return <div className="text-[15px] text-label2">🧾 {media.title}</div>
    case 'unsupported':
      return <div className="text-[15px] text-label2 italic">[不支持的消息类型{media.note ? `：${media.note}` : ''}]</div>
    default:
      return null
  }
}
