import { memo, useState, type ReactNode } from 'react'
import { Copy, ChevronDown } from '../components/Icons'
import { copyText } from '../components/Toast'
import type { Entity } from '../lib/types'
import { useHighlight } from './highlight'

interface Node {
  e: Entity
  start: number
  end: number
}

interface Ctx {
  onHashtag?: (tag: string) => void
  highlight?: string
}

/** 按 Telegram 实体（UTF-16 偏移，与 JS 字符串一致）渲染富文本，支持嵌套 */
export const RichText = memo(function RichText({ text, ents, onHashtag, highlight }: { text: string; ents?: Entity[] } & Ctx) {
  const nodes: Node[] = (ents ?? [])
    .map((e) => ({ e, start: e[1], end: e[1] + e[2] }))
    .filter((n) => n.end > n.start && n.start < text.length)
    .sort((a, b) => a.start - b.start || b.end - a.end)
  return <>{build(text, 0, text.length, nodes, { onHashtag, highlight })}</>
})

function build(text: string, start: number, end: number, list: Node[], ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = []
  let pos = start
  let i = 0
  while (i < list.length) {
    const n = list[i]
    const s = Math.max(n.start, pos)
    const e = Math.min(n.end, end)
    if (e <= s) {
      i++
      continue
    }
    if (s > pos) out.push(plain(text.slice(pos, s), ctx, pos))
    const inner: Node[] = []
    let j = i + 1
    while (j < list.length && list[j].start < e) {
      inner.push({ ...list[j], start: Math.max(list[j].start, s), end: Math.min(list[j].end, e) })
      j++
    }
    out.push(wrap(n.e, text.slice(s, e), build(text, s, e, inner, ctx), s, ctx))
    pos = e
    i = j
  }
  if (pos < end) out.push(plain(text.slice(pos, end), ctx, pos))
  return out
}

function plain(s: string, ctx: Ctx, key: number): ReactNode {
  const q = ctx.highlight?.trim()
  if (!q) return s
  const lower = s.toLowerCase()
  const ql = q.toLowerCase()
  const parts: ReactNode[] = []
  let at = 0
  for (let idx = lower.indexOf(ql); idx !== -1; idx = lower.indexOf(ql, at)) {
    if (idx > at) parts.push(s.slice(at, idx))
    parts.push(<mark key={`${key}-${idx}`}>{s.slice(idx, idx + q.length)}</mark>)
    at = idx + q.length
  }
  if (!parts.length) return s
  parts.push(s.slice(at))
  return <span key={`h${key}`}>{parts}</span>
}

function safeUrl(u: string): string | undefined {
  const url = /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`
  return /^(https?|mailto|tel|tg):/i.test(url) ? url : undefined
}

function A({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return <>{children}</>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  )
}

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false)
  return (
    <span
      className={`spoiler ${shown ? 'revealed' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        setShown(true)
      }}
    >
      {children}
    </span>
  )
}

/** 行内代码：同官方，点一下就复制 */
function InlineCode({ raw, children }: { raw: string; children: ReactNode }) {
  return (
    <code
      role="button"
      tabIndex={0}
      data-press
      className="cursor-pointer rounded bg-fill px-1 font-mono text-[0.88em]"
      style={{ '--press': 1.06 } as React.CSSProperties}
      onClick={(e) => {
        e.stopPropagation()
        void copyText(raw, '代码已复制')
      }}
    >
      {children}
    </code>
  )
}

/** 代码块：语言标签 + 复制按钮 + 轻量着色 */
function CodeBlock({ raw, lang }: { raw: string; lang?: string }) {
  const html = useHighlight(raw, lang)
  return (
    <div className="code-block my-1 overflow-hidden rounded-[10px] bg-fill">
      <div className="flex items-center justify-between px-2.5 pt-1.5 text-[12px] leading-none font-medium text-accent">
        <span className="truncate">{lang || '代码'}</span>
        <button
          type="button"
          data-press
          aria-label="复制代码"
          className="hit-sm -mr-1 flex items-center gap-1 text-label2"
          onClick={(e) => {
            e.stopPropagation()
            void copyText(raw, '代码已复制')
          }}
        >
          <Copy size={14} />
          复制
        </button>
      </div>
      <pre className="overflow-x-auto px-2.5 pt-1 pb-2 font-mono text-[0.82em] leading-snug whitespace-pre">
        {html == null ? <code>{raw}</code> : <code dangerouslySetInnerHTML={{ __html: html }} />}
      </pre>
    </div>
  )
}

/** 引用：发送者选择折叠（或特别长）时默认收起，点按展开/收起，同官方 */
function Quote({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!collapsed)
  const foldable = collapsed
  return (
    <blockquote
      className={`quote relative my-1 rounded-r-md border-l-[3px] border-accent bg-accent/10 py-0.5 pr-6 pl-2 ${foldable ? 'cursor-pointer' : ''} ${open ? '' : 'quote-folded'}`}
      onClick={
        foldable
          ? (e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }
          : undefined
      }
      aria-expanded={foldable ? open : undefined}
    >
      {children}
      {foldable && <ChevronDown size={14} className={`absolute top-1.5 right-1.5 text-accent transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />}
    </blockquote>
  )
}

function wrap(e: Entity, raw: string, children: ReactNode[], key: number, ctx: Ctx): ReactNode {
  const [type, , , extra] = e
  switch (type) {
    case 'b':
      return <strong key={key} className="font-semibold">{children}</strong>
    case 'i':
      return <em key={key}>{children}</em>
    case 'u':
      return <u key={key}>{children}</u>
    case 's':
      return <s key={key}>{children}</s>
    case 'code':
      return (
        <InlineCode key={key} raw={raw}>
          {children}
        </InlineCode>
      )
    case 'pre':
      return <CodeBlock key={key} raw={raw} lang={typeof extra === 'string' ? extra : undefined} />
    case 'quote':
      return (
        <Quote key={key} collapsed={extra === 1 || raw.split('\n').length > 12}>
          {children}
        </Quote>
      )
    case 'spoiler':
      return <Spoiler key={key}>{children}</Spoiler>
    case 'a':
      return (
        <A key={key} href={safeUrl(String(extra ?? ''))}>
          {children}
        </A>
      )
    case 'url':
      return (
        <A key={key} href={safeUrl(raw)}>
          {children}
        </A>
      )
    case 'email':
      return (
        <A key={key} href={`mailto:${raw}`}>
          {children}
        </A>
      )
    case 'phone':
      return (
        <A key={key} href={`tel:${raw.replace(/[^\d+]/g, '')}`}>
          {children}
        </A>
      )
    case 'mention':
      return (
        <A key={key} href={`https://t.me/${raw.replace(/^@/, '')}`}>
          {children}
        </A>
      )
    case 'hashtag':
    case 'cashtag':
      return ctx.onHashtag ? (
        <button
          key={key}
          className="text-accent hover:underline"
          onClick={(ev) => {
            ev.stopPropagation()
            ctx.onHashtag?.(raw)
          }}
        >
          {children}
        </button>
      ) : (
        <span key={key} className="text-accent">
          {children}
        </span>
      )
    case 'mname':
    case 'cmd':
      return (
        <span key={key} className="text-accent">
          {children}
        </span>
      )
    default:
      return <span key={key}>{children}</span>
  }
}
