import { useEffect, useRef, useState } from 'react'
import { dataUrl } from '../lib/api'
import { useInView } from '../lib/hooks'
import { usePrefs } from '../lib/prefs'
import { useScrolling } from '../lib/scrolling'

type Player = typeof import('lottie-web/build/player/lottie_light').default
type Anim = ReturnType<Player['loadAnimation']>

// 播放器按需加载（不进首包），同一个贴纸的动画数据只解压一次
let player: Promise<Player> | null = null
const loadPlayer = () => (player ??= import('lottie-web/build/player/lottie_light').then((m) => m.default))
const dataCache = new Map<string, Promise<unknown>>()
const live = new WeakMap<Element, Anim>()

function loadTgs(file: string): Promise<unknown> {
  let p = dataCache.get(file)
  if (!p) {
    p = fetch(dataUrl(file)).then(async (r) => {
      if (!r.ok || !r.body) throw new Error(String(r.status))
      // .tgs = gzip 压缩的 Lottie JSON
      const stream = r.body.pipeThrough(new DecompressionStream('gzip'))
      return JSON.parse(await new Response(stream).text())
    })
    p.catch(() => dataCache.delete(file))
    dataCache.set(file, p)
  }
  return p
}

/** Telegram 动画贴纸（.tgs）：进入屏幕才加载，离屏暂停；不支持或出错时显示表情 */
export function LottieSticker({ file, emoji }: { file: string; emoji?: string }) {
  const { autoplayStickers } = usePrefs()
  const scrolling = useScrolling()
  const [viewRef, inView] = useInView<HTMLDivElement>('200px')
  const box = useRef<HTMLDivElement | null>(null)
  const anim = useRef<Anim | null>(null)
  const [state, setState] = useState<'idle' | 'ready' | 'error'>('idle')
  const supported = typeof DecompressionStream !== 'undefined'

  useEffect(() => {
    if (!inView || anim.current || !supported || state === 'error') return
    let alive = true
    void Promise.all([loadPlayer(), loadTgs(file)])
      .then(([lottie, data]) => {
        if (!alive || !box.current) return
        anim.current = lottie.loadAnimation({ container: box.current, renderer: 'svg', loop: true, autoplay: false, animationData: data })
        live.set(box.current, anim.current)
        setState('ready')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [inView, file, supported, state])

  useEffect(() => {
    const a = anim.current
    if (!a) return
    if (inView && autoplayStickers && !scrolling) a.play()
    else a.pause()
  }, [inView, autoplayStickers, scrolling, state])

  useEffect(() => () => anim.current?.destroy(), [])

  return (
    <div
      ref={(el) => {
        box.current = el
        viewRef(el)
      }}
      className="relative h-40 w-40"
      data-lottie={file}
      title="贴纸"
      aria-label={emoji ? `${emoji} 贴纸` : '贴纸'}
      // 点按重播一遍（关闭自动播放时也能看）
      onClick={(e) => {
        const a = anim.current
        if (!a) return
        e.stopPropagation()
        a.goToAndPlay(0, true)
      }}
    >
      {state !== 'ready' && <span className="absolute inset-0 flex items-center justify-center text-[88px] leading-none">{emoji || '🖼️'}</span>}
    </div>
  )
}

export function mirrorLottie(src: Element, dst: Element): () => void {
  const made: Anim[] = []
  let alive = true
  const targets = dst.querySelectorAll<HTMLElement>('[data-lottie]')
  src.querySelectorAll('[data-lottie]').forEach((s, i) => {
    const a = live.get(s)
    const d = targets[i]
    const file = s.getAttribute('data-lottie')
    if (!a || !d || !file) return
    const layer = document.createElement('div')
    layer.style.cssText = 'position:absolute;inset:0'
    d.appendChild(layer)
    void Promise.all([loadPlayer(), loadTgs(file)]).then(([lottie, data]) => {
      if (!alive || !layer.isConnected) return
      const m = lottie.loadAnimation({ container: layer, renderer: 'svg', loop: true, autoplay: false, animationData: data })
      made.push(m)
      const start = () => {
        for (const c of [...d.children]) if (c !== layer) c.remove()
        if (a.isPaused) m.goToAndStop(a.currentFrame, true)
        else m.goToAndPlay(a.currentFrame, true)
      }
      if (m.isLoaded) start()
      else m.addEventListener('DOMLoaded', start)
    })
  })
  return () => {
    alive = false
    for (const m of made) m.destroy()
  }
}
