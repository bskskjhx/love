import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronDown, Close } from '../components/Icons'
import { navigate } from '../lib/router'
import { setSearchNav, stepIndex, type SearchNav } from '../lib/searchNav'

export function SearchNavBar({ nav, msgId, current, onGo }: { nav: SearchNav; msgId?: number; current: () => number | undefined; onGo: (id: number) => void }) {
  const [index, setIndex] = useState(-1)
  useEffect(() => {
    if (msgId == null) return
    const i = nav.items.findIndex((x) => x.id === msgId)
    if (i >= 0) setIndex(i)
  }, [nav, msgId])

  const units = useMemo(() => {
    const pos: number[] = []
    let n = 0
    nav.items.forEach((x, i) => {
      if (!x.group || nav.items[i - 1]?.group !== x.group) n++
      pos.push(n)
    })
    return { pos, total: n }
  }, [nav])

  const target = (dir: 1 | -1) => {
    if (index >= 0) return stepIndex(nav.items, index, dir)
    const cur = current() ?? Infinity
    if (dir === 1) return nav.items.findIndex((x) => x.id < cur)
    for (let i = nav.items.length - 1; i >= 0; i--) if (nav.items[i].id > cur) return i
    return -1
  }
  const step = (dir: 1 | -1) => {
    const i = target(dir)
    if (i < 0) return
    setIndex(i)
    onGo(nav.items[i].id)
  }

  return (
    <div className="glass absolute right-[72px] bottom-[calc(var(--safe-bottom)+16px)] left-3 z-20 mx-auto flex h-12 max-w-md animate-pop items-center rounded-full px-1">
      <button onClick={() => setSearchNav(null)} aria-label="关闭搜索结果导航" data-press className="glass-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-label2">
        <Close size={18} />
      </button>
      <button onClick={() => navigate(nav.path)} data-press style={{ '--press': 1.05 } as CSSProperties} className="flex min-w-0 flex-1 flex-col items-start px-1 text-left leading-tight">
        <span className="w-full truncate text-[13px] text-label2">{nav.label || '搜索结果'}</span>
        <span className="text-[15px] font-semibold text-label tabular-nums">
          {index >= 0 ? `${units.pos[index]} / ` : ''}
          {units.total}
          {nav.partial ? '+' : ''}
          {index < 0 ? ' 条结果' : ''}
        </span>
      </button>
      <button onClick={() => step(1)} disabled={target(1) < 0} aria-label="上一条结果（更早）" data-press className="glass-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-accent disabled:text-label3">
        <ChevronDown size={22} className="rotate-180" />
      </button>
      <button onClick={() => step(-1)} disabled={target(-1) < 0} aria-label="下一条结果（更新）" data-press className="glass-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-accent disabled:text-label3">
        <ChevronDown size={22} />
      </button>
    </div>
  )
}
