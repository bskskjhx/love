import { markTransition } from './idle'
import { parse } from 'regexparam'
import { matchRoute } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'

type Route =
  | { name: 'home' }
  | { name: 'chat'; chat: string; msg?: number; topic?: number; all?: boolean }
  | { name: 'media'; chat: string; type?: string; from?: number }
  | { name: 'search'; chat: string; q: string; from?: number; type?: string }
  | { name: 'info'; chat: string }
  | { name: 'stats'; chat: string; user?: number }
  | { name: 'notfound' }

type Params = Record<string, string | undefined>
const num = (v: string | null | undefined) => (v ? Number(v) : undefined)
const posInt = (v: string | undefined) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

const ROUTES: [pattern: string, build: (p: Params, q: URLSearchParams) => Route | undefined][] = [
  ['/', () => ({ name: 'home' })],
  ['/c/:chat', (p) => ({ name: 'chat', chat: p.chat! })],
  ['/c/:chat/info', (p) => ({ name: 'info', chat: p.chat! })],
  [
    '/c/:chat/stats',
    (p, q) => {
      const u = Number(q.get('u'))
      return { name: 'stats', chat: p.chat!, user: q.has('u') && Number.isFinite(u) ? u : undefined }
    },
  ],
  ['/c/:chat/all', (p) => ({ name: 'chat', chat: p.chat!, all: true })],
  ['/c/:chat/media', (p, q) => ({ name: 'media', chat: p.chat!, type: q.get('t') || undefined, from: num(q.get('from')) })],
  ['/c/:chat/search', (p, q) => ({ name: 'search', chat: p.chat!, q: q.get('q') ?? '', from: num(q.get('from')), type: q.get('t') || undefined })],
  ['/c/:chat/t/:topic/:msg?', (p) => (posInt(p.topic) ? { name: 'chat', chat: p.chat!, topic: posInt(p.topic), msg: posInt(p.msg) } : undefined)],
  ['/c/:chat/:msg', (p) => (posInt(p.msg) ? { name: 'chat', chat: p.chat!, msg: posInt(p.msg) } : undefined)],
]

const parser = (route: string) => {
  const { pattern, keys } = parse(route)
  return { pattern, keys: keys as string[] }
}

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const q = new URLSearchParams(query)
  for (const [pattern, build] of ROUTES) {
    const [ok, raw] = matchRoute(parser, pattern, path || '/')
    if (!ok) continue
    const params: Params = {}
    for (const [k, v] of Object.entries(raw)) params[k] = v == null ? undefined : decodeURIComponent(v)
    const route = build(params, q)
    if (route) return route
  }
  return { name: 'notfound' }
}

const chatPath = (chat: string | number) => `/c/${encodeURIComponent(chat)}`

/** 按顺序拼查询参数，跳过空值（空字符串、null、undefined；0 保留） */
function withQuery(path: string, params: [key: string, value: string | number | null | undefined][]): string {
  const p = new URLSearchParams()
  for (const [k, v] of params) if (v != null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `${path}?${s}` : path
}

export const paths = {
  home: () => '/',
  chat: (chat: string | number, msg?: number) => `${chatPath(chat)}${msg ? `/${msg}` : ''}`,
  info: (chat: string | number) => `${chatPath(chat)}/info`,
  /** 发言统计；带 user 时是某位成员的发言趋势 */
  stats: (chat: string | number, user?: number) => `${chatPath(chat)}/stats${user != null ? `?u=${user}` : ''}`,
  /** 论坛群“以消息形式查看” */
  all: (chat: string | number) => `${chatPath(chat)}/all`,
  topic: (chat: string | number, topic: number, msg?: number) => `${chatPath(chat)}/t/${topic}${msg ? `/${msg}` : ''}`,
  media: (chat: string | number, type?: string, from?: number) =>
    withQuery(`${chatPath(chat)}/media`, [
      ['t', type],
      ['from', from],
    ]),
  search: (chat: string | number, q = '', from?: number, type?: string) =>
    withQuery(`${chatPath(chat)}/search`, [
      ['q', q],
      ['from', from],
      ['t', type],
    ]),
}

// ---- 地址订阅用 wouter 的 useHashLocation；另外记录导航方向用于转场动画

type Direction = 'push' | 'pop' | 'replace'
let direction: Direction = 'replace'

function moved(d: Direction) {
  direction = d
  if (d !== 'replace') {
    markTransition()
    // 旧页面转场期间不再用 inert（太慢），这里主动收起焦点，避免键盘在转场中残留
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }
}

window.addEventListener('popstate', (e) => {
  moved((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition ? 'replace' : 'pop')
})

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = '#' + path
  if (url === location.hash) return
  const oldURL = location.href
  const depth = (history.state?.depth ?? 0) + (opts.replace ? 0 : 1)
  if (opts.replace) history.replaceState({ depth }, '', url)
  else history.pushState({ depth }, '', url)
  moved(opts.replace ? 'replace' : 'push')
  dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: location.href }))
}

/** 有应用内历史时返回上一页，否则回到 fallback */
export function goBack(fallback = '/') {
  if ((history.state?.depth ?? 0) > 0) history.back()
  else navigate(fallback, { replace: true })
}

export function useLocation() {
  const [hash] = useHashLocation()
  return { hash, direction }
}
