import { useEffect, useMemo, useRef, useState } from 'react'
import YetAnotherLightbox, { useController, useLightboxState, type Slide } from 'yet-another-react-lightbox'
import Captions from 'yet-another-react-lightbox/plugins/captions'
import Download from 'yet-another-react-lightbox/plugins/download'
import Share from 'yet-another-react-lightbox/plugins/share'
import Video from 'yet-another-react-lightbox/plugins/video'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/captions.css'
import { ChevronLeft, Comment, Download as DownloadIcon, Share as ShareIcon } from '../components/Icons'
import { dataUrl } from '../lib/api'
import { fullDate } from '../lib/format'
import { useCloseWhenInactive } from '../lib/hooks'
import type { Message } from '../lib/types'

export interface LightboxItem {
  msg: Message
  name: string
}

interface Props {
  items: LightboxItem[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
  onShowInChat?: (id: number) => void
}

function slideOf({ msg, name }: LightboxItem): Slide {
  const m = msg.media
  const file = m?.file ? dataUrl(m.file) : ''
  const shared = file ? { download: file, share: { url: new URL(file, location.href).href, title: name, text: msg.text || undefined } } : {}
  const description = msg.text || undefined
  const kind = m?.type
  if (kind === 'video' || kind === 'gif' || kind === 'round') {
    const gif = kind === 'gif'
    return {
      type: 'video',
      sources: [{ src: file, type: m?.mime || 'video/mp4' }],
      poster: m?.thumb ? dataUrl(m.thumb) : undefined,
      width: m?.w,
      height: m?.h,
      autoPlay: true,
      loop: gif,
      muted: gif,
      controls: !gif,
      playsInline: true,
      description,
      ...shared,
    }
  }
  return { src: file, width: m?.w, height: m?.h, description, ...shared }
}

const DOUBLE_TAP = 280

function useTapToggle(root: HTMLElement | null, toggle: () => void) {
  const latest = useRef(toggle)
  latest.current = toggle
  useEffect(() => {
    if (!root) return
    let down: { x: number; y: number } | null = null
    let timer = 0
    let last = 0
    const onDown = (e: PointerEvent) => {
      down = e.isPrimary ? { x: e.clientX, y: e.clientY } : null
    }
    const onUp = (e: PointerEvent) => {
      const start = down
      down = null
      if (!start || !e.isPrimary || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return
      if ((e.target as Element).closest('button, a, video, .lb-chrome, .yarl__toolbar')) return
      const now = e.timeStamp
      if (now - last < DOUBLE_TAP) {
        clearTimeout(timer)
        last = 0
        return
      }
      last = now
      timer = window.setTimeout(() => latest.current(), DOUBLE_TAP)
    }
    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointerup', onUp)
    return () => {
      clearTimeout(timer)
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointerup', onUp)
    }
  }, [root])
}

function TopBar({ items }: { items: LightboxItem[] }) {
  const { currentIndex } = useLightboxState()
  const { close } = useController()
  const it = items[currentIndex]
  return (
    <div className="lb-chrome lb-top">
      <button type="button" onClick={close} aria-label="关闭" className="lb-glass lb-circle">
        <ChevronLeft size={22} />
      </button>
      {it && (
        <div className="lb-glass lb-title">
          <div className="truncate text-[15px] leading-tight font-semibold">{it.name}</div>
          <div className="truncate text-[12px] leading-tight opacity-70 tabular-nums">
            {fullDate(it.msg.date)}
            {items.length > 1 ? ` · ${currentIndex + 1}/${items.length}` : ''}
          </div>
        </div>
      )}
      <span className="lb-circle" aria-hidden />
    </div>
  )
}

export function Lightbox({ items, index, onClose, onIndex, onShowInChat }: Props) {
  useCloseWhenInactive(true, onClose)
  const slides = useMemo(() => items.map(slideOf), [items])
  const current = items[index]
  const [chrome, setChrome] = useState(true)
  const [root, setRoot] = useState<HTMLElement | null>(null)
  useTapToggle(root, () => setChrome((v) => !v))

  return (
    <YetAnotherLightbox
      open
      index={index}
      slides={slides}
      close={onClose}
      className={`ios-lb ${chrome ? 'lb-on' : 'lb-off'}`}
      on={{ view: ({ index: i }) => onIndex(i), entering: () => setRoot(document.querySelector<HTMLElement>('.ios-lb')) }}
      plugins={[Zoom, Video, Captions, Share, Download]}
      carousel={{ finite: true, preload: 1, padding: 0, spacing: '8%' }}
      animation={{ fade: 300, swipe: 380 }}
      controller={{ closeOnPullDown: true, closeOnBackdropClick: false }}
      zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }}
      captions={{ descriptionTextAlign: 'center', descriptionMaxLines: 4 }}
      labels={{ Previous: '上一张', Next: '下一张', Close: '关闭', Download: '存储到本机', Share: '分享', Lightbox: '查看图片', Carousel: '图片', Slide: '第 {index} 张，共 {total} 张' }}
      render={{
        controls: () => <TopBar items={items} />,
        buttonZoom: () => null,
        iconShare: () => <ShareIcon size={21} />,
        iconDownload: () => <DownloadIcon size={21} />,
        iconPrev: () => <ChevronLeft size={22} />,
        iconNext: () => <ChevronLeft size={22} className="rotate-180" />,
      }}
      toolbar={{
        buttons: [
          'share',
          onShowInChat && current ? (
            <button key="chat" type="button" className="yarl__button lb-pill" onClick={() => onShowInChat(current.msg.id)}>
              <Comment size={19} />
              <span>在聊天中显示</span>
            </button>
          ) : null,
          'download',
        ],
      }}
    />
  )
}
