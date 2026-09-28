import { Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CenterState } from './components/States'
import { MiniPlayer } from './components/MiniPlayer'
import { ToastHost } from './components/Toast'
import { getIndex } from './lib/api'
import { setTimeZone } from './lib/format'
import { goBack, navigate, parseRoute, useLocation } from './lib/router'
import { standalone } from './lib/viewport'
import { useDrag } from '@use-gesture/react'
import { ChatPage } from './pages/Chat'
import { ChatListPage } from './pages/ChatList'
import { InfoPage, SearchPage, SharedMediaPage, StatsPage, prefetchLazy } from './lazy'
import { afterTransition } from './lib/idle'
import { PageActive } from './lib/pageActive'

export default function App() {
  const { hash, direction } = useLocation()
  const route = parseRoute(hash)
  const [ready, setReady] = useState(false)

  // 先拿到时区设置再渲染，保证日期分组一致
  useEffect(() => {
    getIndex()
      .then((i) => i.timezone && setTimeZone(i.timezone))
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (ready) return afterTransition(prefetchLazy, 3000)
  }, [ready])

  if (!ready) return null

  let page
  let key: string
  switch (route.name) {
    case 'home':
      key = 'home'
      page = <ChatListPage />
      break
    case 'chat':
      key = `chat:${route.chat}${route.topic ? `:t${route.topic}` : route.all ? ':all' : ''}`
      page = <ChatPage chatKey={route.chat} msgId={route.msg} pushed={direction === 'push'} topic={route.topic} all={route.all} />
      break
    case 'media':
      key = `media:${route.chat}`
      page = (
        <Suspense fallback={null}>
          <SharedMediaPage chatKey={route.chat} type={route.type} from={route.from} />
        </Suspense>
      )
      break
    case 'search':
      key = `search:${route.chat}`
      page = (
        <Suspense fallback={null}>
          <SearchPage chatKey={route.chat} q={route.q} from={route.from} type={route.type} />
        </Suspense>
      )
      break
    case 'stats':
      key = `stats:${route.chat}:${route.user ?? ''}`
      page = (
        <Suspense fallback={null}>
          <StatsPage chatKey={route.chat} user={route.user} />
        </Suspense>
      )
      break
    case 'info':
      key = `info:${route.chat}`
      page = (
        <Suspense fallback={null}>
          <InfoPage chatKey={route.chat} />
        </Suspense>
      )
      break
    default:
      key = 'notfound'
      page = (
        <CenterState>
          <div className="text-[17px] text-label">页面不存在</div>
          <button onClick={() => navigate('/', { replace: true })} className="text-accent">
            返回首页
          </button>
        </CenterState>
      )
  }

  return (
    <>
      <PageStack pageKey={key} direction={direction}>
        {page}
      </PageStack>
      <MiniPlayer />
      <ToastHost />
    </>
  )
}

interface Anim {
  from: string
  dir: 'push' | 'pop'
  swipe: number
}

const MAX_KEEP = 4

let swipeRelease = 0

/**
 * 独立 App 模式下从屏幕左边缘右滑返回（手势识别用 @use-gesture：锁定横向、10px 起步、按速度判断），
 * 页面和下一层的位移、阴影由这里直接写样式，跟手不经过 React。
 */
function useEdgeSwipeBack(container: React.RefObject<HTMLDivElement | null>, busy: boolean) {
  const busyRef = useRef(busy)
  busyRef.current = busy
  const layers = useRef<{ page: HTMLElement; under: HTMLElement | null } | null>(null)

  const place = (p: number) => {
    const s = layers.current
    if (!s) return
    s.page.style.transform = `translateX(${p * 100}%)`
    if (s.under) {
      s.under.style.transform = `translateX(${-30 * (1 - p)}%)`
      s.under.style.setProperty('--swipe-p', String(p))
    }
  }
  const reset = () => {
    const s = layers.current
    if (!s) return
    const { page, under: u } = s
    page.style.transition = 'transform 0.45s var(--spring-snappy)'
    page.style.transform = ''
    page.style.boxShadow = ''
    if (u) {
      u.style.transition = 'transform 0.45s var(--spring-snappy)'
      u.style.transform = 'translateX(-30%)'
      u.style.setProperty('--swipe-p', '0')
      u.classList.add('page-swipe-settle')
      window.setTimeout(() => {
        if (u.hasAttribute('data-current')) return
        u.classList.remove('is-transitioning', 'page-swipe-shade', 'page-swipe-settle')
        u.classList.add('page-hidden')
        u.style.transform = ''
        u.style.transition = ''
        u.style.removeProperty('--swipe-p')
      }, 460)
    }
  }

  useDrag(
    ({ first, last, movement: [mx], velocity: [vx], direction: [dir], initial: [ix], event, cancel }) => {
      const el = container.current
      if (!el) return
      if (first) {
        const page = el.querySelector<HTMLElement>(':scope > main[data-current]')
        if (ix > 24 || busyRef.current || (history.state?.depth ?? 0) < 1 || !page) return cancel()
        const under = el.querySelector<HTMLElement>(':scope > main[data-prev]')
        layers.current = { page, under }
        page.style.transition = 'none'
        page.style.boxShadow = '-12px 0 32px rgb(0 0 0 / 0.14)'
        if (under) {
          under.style.transition = 'none'
          under.classList.remove('page-hidden', 'page-swipe-settle')
          under.classList.add('is-transitioning', 'page-swipe-shade')
        }
      }
      if (!layers.current) return
      if (event.cancelable) event.preventDefault()
      const w = el.clientWidth || 1
      place(Math.max(0, mx) / w)
      if (last) {
        if (mx > w * 0.35 || (vx > 0.5 && dir > 0)) {
          swipeRelease = Math.min(1, Math.max(0, mx / w))
          goBack()
        } else reset()
        layers.current = null
      }
    },
    { target: container, enabled: standalone, axis: 'x', threshold: 10, pointer: { touch: true }, eventOptions: { passive: false } },
  )
}

function PageStack({ pageKey, direction, children }: { pageKey: string; direction: string; children: ReactNode }) {
  const [current, setCurrent] = useState(pageKey)
  const [prev, setPrev] = useState<string | null>(null)
  const [keys, setKeys] = useState<string[]>([pageKey])
  const [anim, setAnim] = useState<Anim | null>(null)
  const nodes = useRef(new Map<string, ReactNode>())
  const visited = useRef(new Map<string, number>())

  if (current !== pageKey) {
    const dir = direction === 'push' || direction === 'pop' ? direction : null
    const swipe = dir === 'pop' ? swipeRelease : 0
    swipeRelease = 0
    visited.current.set(current, performance.now())
    let next = keys.includes(pageKey) ? keys : [...keys, pageKey]
    while (next.length > MAX_KEEP) {
      const drop = next
        .filter((k) => k !== pageKey && k !== current)
        .sort((a, b) => (visited.current.get(a) ?? 0) - (visited.current.get(b) ?? 0))[0]
      if (!drop) break
      next = next.filter((k) => k !== drop)
      nodes.current.delete(drop)
      visited.current.delete(drop)
    }
    setKeys(next)
    setPrev(current)
    setCurrent(pageKey)
    setAnim(dir ? { from: current, dir, swipe } : null)
  }

  const container = useRef<HTMLDivElement>(null)
  useEdgeSwipeBack(container, anim != null)
  useLayoutEffect(() => {
    nodes.current.set(pageKey, children)
  })
  useLayoutEffect(() => {
    if (!anim) return
    container.current?.querySelectorAll<HTMLElement>(':scope > main').forEach((m) => {
      m.style.transform = ''
      m.style.transition = ''
      m.style.boxShadow = ''
      m.style.removeProperty('--swipe-p')
    })
    const t = setTimeout(() => setAnim(null), 560)
    return () => clearTimeout(t)
  }, [anim])

  const searchIn = anim?.dir === 'push' && pageKey.startsWith('search:')
  const searchOut = anim?.dir === 'pop' && !anim.swipe && anim.from.startsWith('search:')
  const frontClass = searchIn
    ? 'search-enter z-10 animate-search-page-in'
    : searchOut
      ? 'is-transitioning page-shade-out animate-search-under-in'
      : anim?.dir === 'push'
        ? 'page-front z-10 animate-page-push-in'
        : anim
          ? 'is-transitioning page-shade-out animate-page-pop-in'
          : ''
  const backClass = searchIn
    ? 'is-transitioning page-shade-in animate-search-under-out'
    : searchOut
      ? 'search-leave z-10 animate-search-page-out'
      : anim?.dir === 'push'
        ? 'is-transitioning page-shade-in animate-page-push-out'
        : 'page-front z-10 animate-page-pop-out'

  return (
    <div ref={container} className="relative h-full overflow-hidden">
      {keys.map((k) => {
        const isCurrent = k === current
        const isBack = !!anim && k === anim.from && !isCurrent
        const popSwipe = anim?.dir === 'pop' && anim.swipe
        const style = popSwipe
          ? isCurrent
            ? ({ '--pop-from': `${-30 * (1 - anim.swipe)}%`, '--shade-from': 0.1 * (1 - anim.swipe) } as React.CSSProperties)
            : isBack
              ? ({ '--swipe-x': `${anim.swipe * 100}%` } as React.CSSProperties)
              : undefined
          : undefined
        const cls = isCurrent ? frontClass : isBack ? backClass : 'page-hidden'
        return (
          <main
            key={k}
            inert={!isCurrent && !isBack}
            aria-hidden={isCurrent ? undefined : true}
            data-current={isCurrent ? '' : undefined}
            data-prev={!isCurrent && k === prev ? '' : undefined}
            style={style}
            className={`absolute inset-0 ${cls}`}
          >
            <PageActive.Provider value={isCurrent}>{isCurrent ? children : nodes.current.get(k)}</PageActive.Provider>
            {isBack && <div className="absolute inset-0 z-[1000]" />}
          </main>
        )
      })}
    </div>
  )
}
