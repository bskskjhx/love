import type { EChartsOption } from 'echarts'
import { CalendarCheck, Clock, Flame, MessageSquareText, Mountain, Repeat2, TrendingUp, Type, Users as UsersIcon, type LucideIcon } from 'lucide-react'
import { Progress, ToggleGroup } from 'radix-ui'
import { usePinch } from '@use-gesture/react'
import type { ECharts } from 'echarts/core'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Avatar } from '../components/Avatar'
import { ChevronDown, ChevronRight } from '../components/Icons'
import { NavBar } from '../components/NavBar'
import { ErrorState, LoadState } from '../components/States'
import { count, fullDate, WEEKDAYS } from '../lib/format'
import { goBack, navigate, paths } from '../lib/router'
import {
  activeSenders,
  bucketLabel,
  buckets,
  dateOf,
  KINDS,
  longestStreak,
  movingAverage,
  peakDay,
  rankOf,
  series,
  useChatStats,
  useStatsProgress,
  type ChatStats,
  type Grain,
  type Tally,
} from '../lib/stats'
import { useDocumentTitle, useIsDark } from '../lib/theme'
import type { Users } from '../lib/types'
import { useChat } from '../lib/useChat'
import { Chart, palette, type Palette } from '../stats/Chart'

const GRAINS: { v: Grain; label: string }[] = [
  { v: 'day', label: '按日' },
  { v: 'week', label: '按周' },
  { v: 'month', label: '按月' },
]
/** 周一开头 */
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)
/** 占比文字，很小但不为 0 时写成 <0.1% */
const share = (a: number, b: number) => (a && pct(a, b) === 0 ? '<0.1%' : `${pct(a, b)}%`)
const dayText = (n: number) => {
  const { y, m, d } = dateOf(n)
  return `${y}年${m}月${d}日`
}

export function StatsPage({ chatKey, user }: { chatKey: string; user?: number }) {
  const { chat, error, retry } = useChat(chatKey)
  const meta = chat?.meta
  const users = chat?.users
  const stats = useChatStats(meta)
  const progress = useStatsProgress((s) => (meta ? (s[meta.id] ?? 0) : 0))
  const [scrolled, setScrolled] = useState(false)
  const who = user != null ? users?.[user] : undefined
  const title = user != null ? (who?.name ?? '成员') : '发言统计'
  useDocumentTitle(meta ? `${title} · ${meta.title}` : undefined)

  return (
    <div className="relative h-full bg-grouped">
      <NavBar
        back={{ label: '返回', onClick: () => goBack(user != null ? paths.stats(chatKey) : paths.info(chatKey)) }}
        title={user != null ? (who?.name ?? '发言趋势') : '发言统计'}
        subtitle={meta?.title}
        titleVisible={scrolled}
        transparentUntilScroll
        scrolled={scrolled}
      />
      <div
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > (user != null ? 110 : 40))}
        className="scroller absolute inset-0 pt-[calc(var(--safe-top)+var(--nav-h)+var(--player-h))] pb-[calc(var(--safe-bottom)+32px)]"
      >
        {!chat && <LoadState error={error} retry={retry} />}
        {meta && users && (
          <div className="mx-auto max-w-2xl px-4">
            {user != null ? (
              <Header users={users} user={user} />
            ) : (
              <div className="px-1 pb-3">
                <h1 className="text-[34px] leading-[41px] font-bold tracking-tight">发言统计</h1>
                <div className="truncate text-[15px] text-label2">{meta.title}</div>
              </div>
            )}
            {stats.isError ? (
              <ErrorState error={stats.error} retry={() => void stats.refetch()} />
            ) : !stats.data ? (
              <div className="mt-2 rounded-[var(--r-card)] bg-cell px-5 py-5">
                <div className="mb-3 flex items-baseline justify-between text-[15px]">
                  <span className="text-label2">正在统计 {count(meta.count ?? 0)} 条消息</span>
                  <span className="text-[20px] font-semibold tabular-nums">{Math.round(progress * 100)}%</span>
                </div>
                <Progress.Root value={Math.round(progress * 100)} aria-label="统计进度" className="h-2 overflow-hidden rounded-full bg-fill">
                  <Progress.Indicator className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-300" style={{ transform: `scaleX(${progress})` }} />
                </Progress.Root>
              </div>
            ) : user != null && !stats.data.users.get(user) ? (
              <div className="mt-2 rounded-[var(--r-card)] bg-cell px-4 py-8 text-center text-[15px] text-label2">存档里没有 TA 的发言</div>
            ) : (
              <Body stats={stats.data} users={users} user={user} chatKey={chatKey} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Header({ users, user }: { users: Users; user: number }) {
  const u = users[user]
  return (
    <div className="flex flex-col items-center pt-2 pb-5 text-center">
      <div className="rounded-full p-[3px] shadow-[0_8px_24px_rgb(0_0_0/0.12)] ring-1 ring-[var(--glass-edge)]">
        <Avatar id={user} name={u?.name ?? '?'} src={u?.avatar} size={88} />
      </div>
      <div className="mt-3 max-w-full truncate text-[26px] leading-tight font-bold tracking-tight">{u?.name ?? '未知用户'}</div>
      {u?.username && <div className="text-[15px] text-label2">@{u.username}</div>}
    </div>
  )
}

function Body({ stats, users, user, chatKey }: { stats: ChatStats; users: Users; user?: number; chatKey: string }) {
  const t = user != null ? stats.users.get(user)! : stats.group
  const group = user != null ? stats.group : undefined
  if (!t.total) return <div className="mt-2 rounded-[var(--r-card)] bg-cell px-4 py-8 text-center text-[15px] text-label2">存档里还没有发言</div>
  return (
    <>
      <Hero stats={stats} t={t} member={user != null} />
      <Summary t={t} stats={stats} member={user} />
      <Trend stats={stats} t={t} member={user != null} />
      <Rhythm t={t} group={group} />
      <Kinds t={t} />
      {user == null && <Top stats={stats} users={users} chatKey={chatKey} />}
    </>
  )
}

function Section({ title, footer, plain, children }: { title: ReactNode; footer?: ReactNode; plain?: boolean; children: ReactNode }) {
  return (
    <section className="pt-7">
      <h2 className="px-1 pb-2.5 text-[22px] leading-7 font-bold tracking-tight">{title}</h2>
      {plain ? children : <div className="overflow-hidden rounded-[var(--r-card)] bg-cell">{children}</div>}
      {footer && <p className="px-4 pt-2 text-[13px] leading-snug text-label2">{footer}</p>}
    </section>
  )
}

function Segmented<T extends string>({ items, value, onChange, label }: { items: { v: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const i = items.findIndex((g) => g.v === value)
  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={(v) => v && onChange(v as T)} aria-label={label} className="relative flex rounded-full bg-fill p-[3px]">
      <div
        aria-hidden
        className="glass absolute top-[3px] bottom-[3px] left-[3px] rounded-full transition-transform duration-700 ease-[var(--spring-bouncy)]"
        style={{ width: `calc((100% - 6px) / ${items.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {items.map((g) => (
        <ToggleGroup.Item
          key={g.v}
          value={g.v}
          className="relative h-8 flex-1 rounded-full text-[14px] font-medium text-label2 transition-colors duration-300 data-[state=on]:font-semibold data-[state=on]:text-label"
        >
          {g.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

// ---- 概览

function Hero({ stats, t, member }: { stats: ChatStats; t: Tally; member: boolean }) {
  const dark = useIsDark()
  const recent = useMemo(() => {
    const to = Math.max(...stats.group.days.keys())
    const keys = buckets(to - 29, to, 'day')
    return series(t, keys, 'day')
  }, [stats, t])
  const sum = recent.reduce((a, b) => a + b, 0)
  const option = useCallback(
    (): EChartsOption => ({
      grid: { left: 0, right: 0, top: 4, bottom: 0 },
      tooltip: { show: false },
      xAxis: { type: 'category', show: false, boundaryGap: false, data: recent.map((_, i) => i) },
      yAxis: { type: 'value', show: false, min: 0 },
      series: [
        {
          type: 'line',
          data: recent,
          smooth: 0.4,
          showSymbol: false,
          silent: true,
          lineStyle: { color: 'rgba(255,255,255,0.95)', width: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(255,255,255,0.45)' }, { offset: 1, color: 'rgba(255,255,255,0)' }] } },
        },
      ],
    }),
    [recent],
  )
  return (
    <div
      className="relative mt-1 overflow-hidden rounded-[28px] text-white shadow-[0_12px_32px_rgb(0_80_200/0.25)]"
      style={{ background: dark ? 'linear-gradient(145deg,#0a84ff 0%,#5e5ce6 100%)' : 'linear-gradient(145deg,#1a8cff 0%,#5856d6 100%)' }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgb(255_255_255/0.28),transparent_55%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[28px] shadow-[inset_0_1px_0.5px_rgb(255_255_255/0.5)]" />
      <div className="relative px-5 pt-4">
        <div className="flex items-center gap-1.5 text-[15px] font-semibold text-white/85">
          <MessageSquareText size={17} strokeWidth={2.4} aria-hidden />
          {member ? 'TA 的发言' : '全部发言'}
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[44px] leading-none font-bold tracking-tight tabular-nums">{t.total.toLocaleString()}</span>
          <span className="text-[17px] font-semibold text-white/80">条</span>
        </div>
        {t.last > 0 && (
          <div className="mt-1.5 text-[13px] text-white/75">
            {fullDate(t.first, false)} – {fullDate(t.last, false)}
          </div>
        )}
      </div>
      <div className="relative mt-2">
        <Chart option={option} height={64} />
      </div>
      <div className="relative flex items-center justify-between bg-black/10 px-5 py-2.5 text-[13px] font-medium text-white/90">
        <span>近 30 天</span>
        <span className="tabular-nums">{sum.toLocaleString()} 条 · 日均 {Math.round((sum / 30) * 10) / 10}</span>
      </div>
    </div>
  )
}

function Tile({ icon: Icon, color, label, value, unit, sub }: { icon: LucideIcon; color: string; label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[22px] bg-cell px-3.5 pt-3 pb-3">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color }}>
        <Icon size={15} strokeWidth={2.5} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1 truncate">
        <span className="text-[26px] leading-none font-bold tracking-tight tabular-nums">{value}</span>
        {unit && <span className="text-[14px] font-semibold text-label2">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 truncate text-[12px] text-label2">{sub}</div>}
    </div>
  )
}

function Summary({ t, stats, member }: { t: Tally; stats: ChatStats; member?: number }) {
  const active = t.days.size
  const span = t.last ? Math.max(1, Math.round((t.last - t.first) / 86400) + 1) : 0
  const peak = peakDay(t)
  const texts = t.kinds.text
  const hour = t.hours.indexOf(Math.max(...t.hours))
  return (
    <Section title="概览" plain>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {member != null ? (
          <Tile icon={UsersIcon} color="#5856d6" label="占全群" value={pct(t.total, stats.group.total)} unit="%" sub={`第 ${rankOf(stats, member)} 名 / ${count(stats.users.size)} 人`} />
        ) : (
          <Tile icon={UsersIcon} color="#5856d6" label="发言人数" value={count(stats.users.size)} unit="人" sub="发过至少一条消息" />
        )}
        <Tile icon={Type} color="#af52de" label="文字字数" value={count(t.chars)} unit="字" sub={texts ? `平均每条 ${Math.round(t.chars / texts)} 字` : undefined} />
        <Tile icon={CalendarCheck} color="#ff2d55" label="活跃天数" value={count(active)} unit="天" sub={span ? `跨度 ${count(span)} 天中的 ${pct(active, span)}%` : undefined} />
        <Tile icon={TrendingUp} color="#34c759" label="日均发言" value={active ? Math.round((t.total / active) * 10) / 10 : 0} unit="条" sub="按活跃日计算" />
        <Tile icon={Mountain} color="#ff9500" label="单日最多" value={peak ? count(peak[1]) : '-'} unit={peak ? '条' : undefined} sub={peak ? dayText(peak[0]) : undefined} />
        <Tile icon={Flame} color="#ff3b30" label="最长连续" value={longestStreak(t)} unit="天" sub="每天都有发言" />
        <Tile icon={Clock} color="#5ac8fa" label="最活跃时段" value={`${hour}:00`} sub={`${hour}:00–${hour + 1}:00 占 ${pct(t.hours[hour], t.total)}%`} />
        <Tile icon={Repeat2} color="#00c7be" label="回复 / 转发" value={pct(t.replies, t.total)} unit="%" sub={`回复 ${count(t.replies)} · 转发 ${count(t.forwards)}`} />
      </div>
    </Section>
  )
}

// ---- 趋势

/** 默认显示最近这么多个桶，其余拖动下方滑块查看 */
const VISIBLE: Record<Grain, number> = { day: 60, week: 40, month: 36 }
const MIN_BARS = 7
const coarse = () => matchMedia('(pointer: coarse)').matches

interface PinchStart {
  start: number
  end: number
  dist: number
  x: number
  focus: number
}

function usePinchZoom(bars: number) {
  const chart = useRef<ECharts | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const pending = useRef<{ start: number; end: number } | null>(null)
  const frame = useRef(0)
  const onReady = useCallback((c: ECharts) => {
    chart.current = c
  }, [])
  const apply = useCallback((start: number, end: number) => {
    pending.current = { start, end }
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const next = pending.current
      pending.current = null
      if (next) chart.current?.dispatchAction({ type: 'dataZoom', ...next, animation: { duration: 0 } })
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  usePinch(
    ({ first, da: [dist], origin: [x], memo }) => {
      const c = chart.current
      const el = box.current
      if (!c || !el) return memo
      const rect = el.getBoundingClientRect()
      let m = memo as PinchStart | undefined
      if (first || !m) {
        const dz = (c.getOption().dataZoom as { start: number; end: number }[] | undefined)?.[0]
        const start = dz?.start ?? 0
        const end = dz?.end ?? 100
        m = { start, end, dist, x, focus: Math.min(1, Math.max(0, (x - rect.left) / rect.width)) }
        return m
      }
      const span0 = m.end - m.start
      const minSpan = Math.min(100, (MIN_BARS / Math.max(1, bars)) * 100)
      const span = Math.min(100, Math.max(minSpan, span0 / (dist / m.dist)))
      const anchor = m.start + m.focus * span0 - ((x - m.x) / rect.width) * span
      const start = Math.min(100 - span, Math.max(0, anchor - m.focus * span))
      apply(start, start + span)
      return m
    },
    { target: box, enabled: coarse(), eventOptions: { passive: false }, pointer: { touch: true } },
  )
  return { box, onReady }
}

function Trend({ stats, t, member }: { stats: ChatStats; t: Tally; member: boolean }) {
  const [grain, setGrain] = useState<Grain>('week')
  const data = useMemo(() => {
    const from = Math.min(...stats.group.days.keys())
    const to = Math.max(...stats.group.days.keys())
    const keys = buckets(from, to, grain)
    const mine = series(t, keys, grain)
    const all = member ? series(stats.group, keys, grain) : mine
    return {
      labels: keys.map((k) => bucketLabel(k, grain)),
      mine,
      avg: grain === 'day' ? movingAverage(mine, 7) : undefined,
      second: member ? all.map((n, i) => pct(mine[i], n)) : activeSenders(stats, keys, grain),
    }
  }, [stats, t, member, grain])

  const option = useCallback(
    (p: Palette): EChartsOption => {
      const n = data.labels.length
      const start = n > VISIBLE[grain] ? Math.round((1 - VISIBLE[grain] / n) * 100) : 0
      return {
        grid: { left: 2, right: 2, top: 30, bottom: 40, containLabel: true },
        legend: { top: 0, left: 0 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: p.sep } } },
        xAxis: {
          type: 'category',
          data: data.labels,
          axisLine: { lineStyle: { color: p.sep } },
          axisTick: { show: false },
          axisLabel: { color: p.label2, hideOverlap: true, formatter: (v: string) => (grain === 'month' ? v : v.slice(5)) },
        },
        yAxis: [
          { type: 'value', minInterval: 1, splitNumber: 4, splitLine: { lineStyle: { color: p.grid, type: 'dashed' } }, axisLabel: { color: p.label2 } },
          { type: 'value', splitNumber: 4, minInterval: member ? undefined : 1, max: member ? 100 : undefined, splitLine: { show: false }, axisLabel: { color: p.label2, formatter: member ? '{value}%' : '{value}' } },
        ],
        dataZoom: [
          { type: 'inside', start, end: 100, minValueSpan: MIN_BARS - 1, zoomLock: coarse(), zoomOnMouseWheel: true, moveOnMouseMove: false, moveOnMouseWheel: false, preventDefaultMouseMove: false },
          {
            type: 'slider',
            start,
            end: 100,
            minValueSpan: MIN_BARS - 1,
            height: 18,
            bottom: 4,
            left: 12,
            right: 12,
            borderColor: 'transparent',
            backgroundColor: p.grid,
            fillerColor: `${p.accent}2e`,
            handleIcon: 'path://M0,0 h4 a4,4 0 0 1 4,4 v10 a4,4 0 0 1 -4,4 h-4 a4,4 0 0 1 -4,-4 v-10 a4,4 0 0 1 4,-4z',
            handleSize: '100%',
            handleStyle: { color: p.cell, borderColor: p.sep, shadowBlur: 4, shadowColor: 'rgba(0,0,0,0.2)' },
            moveHandleSize: 0,
            showDetail: false,
            dataBackground: { lineStyle: { color: p.accent, opacity: 0.5 }, areaStyle: { color: p.accent, opacity: 0.15 } },
            selectedDataBackground: { lineStyle: { color: p.accent }, areaStyle: { color: p.accent, opacity: 0.3 } },
          },
        ],
        series: [
          { name: member ? 'TA 的发言' : '消息数', type: 'bar', data: data.mine, itemStyle: { color: p.accent, borderRadius: [4, 4, 1, 1] }, barMaxWidth: 12, barCategoryGap: '30%', large: true },
          ...(data.avg ? [{ name: '7 日均线', type: 'line' as const, data: data.avg, showSymbol: false, smooth: true, lineStyle: { color: p.third, width: 2 }, itemStyle: { color: p.third } }] : []),
          {
            name: member ? '占全群比例' : '活跃人数',
            type: 'line',
            yAxisIndex: 1,
            data: data.second,
            showSymbol: false,
            smooth: true,
            lineStyle: { color: p.second, width: 2 },
            itemStyle: { color: p.second },
            tooltip: member ? { valueFormatter: (v) => `${v}%` } : undefined,
          },
        ],
      }
    },
    [data, grain, member],
  )
  const pinch = usePinchZoom(data.labels.length)

  return (
    <Section title="发言趋势" footer={`双指缩放图表，或拖动下方滑块查看更早的时间。${member ? '橙线是 TA 在全群发言中的占比。' : '橙线是这段时间里发过言的人数。'}`}>
      <div className="px-3 pt-3 pb-1">
        <Segmented items={GRAINS} value={grain} onChange={setGrain} label="时间粒度" />
        <div ref={pinch.box} className="mt-3 touch-pan-y">
          <Chart option={option} height={280} onReady={pinch.onReady} />
        </div>
      </div>
    </Section>
  )
}

// ---- 分布

type RhythmView = 'hour' | 'week' | 'heat'
const RHYTHM: { v: RhythmView; label: string }[] = [
  { v: 'hour', label: '时段' },
  { v: 'week', label: '星期' },
  { v: 'heat', label: '热力图' },
]

function Rhythm({ t, group }: { t: Tally; group?: Tally }) {
  const [view, setView] = useState<RhythmView>('hour')
  const peak = t.hours.indexOf(Math.max(...t.hours))
  const wd = WD_ORDER.reduce((a, d) => (t.weekdays[d] > t.weekdays[a] ? d : a), WD_ORDER[0])
  const footer =
    view === 'hour'
      ? `最活跃在 ${peak}:00–${peak + 1}:00，占 ${pct(t.hours[peak], t.total)}%${group ? '；柱子是 TA 各时段的占比，橙线是全群。' : '。'}`
      : view === 'week'
        ? `周${WEEKDAYS[wd]}发言最多，占 ${pct(t.weekdays[wd], t.total)}%${group ? '；柱子是 TA 的占比，橙线是全群。' : '。'}`
        : '每一格是一周中某天的某个小时，颜色越深发言越多。点按格子查看条数。'
  return (
    <Section title="活跃规律" footer={footer}>
      <div className="px-3 pt-3 pb-2">
        <Segmented items={RHYTHM} value={view} onChange={setView} label="分布视图" />
        <div className="mt-3">{view === 'hour' ? <Hours t={t} group={group} /> : view === 'week' ? <Weekdays t={t} group={group} /> : <Heat t={t} />}</div>
      </div>
    </Section>
  )
}

function Hours({ t, group }: { t: Tally; group?: Tally }) {
  const option = useCallback(
    (p: Palette): EChartsOption => ({
      grid: { left: 2, right: 2, top: group ? 30 : 10, bottom: 2, containLabel: true },
      legend: group ? { top: 0, left: 0 } : undefined,
      tooltip: { trigger: 'axis', valueFormatter: group ? (v) => `${v}%` : undefined },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, h) => `${h}时`), axisLine: { lineStyle: { color: p.sep } }, axisTick: { show: false }, axisLabel: { color: p.label2, interval: 5, formatter: (v: string) => v.replace('时', ':00') } },
      yAxis: { type: 'value', splitNumber: 4, minInterval: group ? undefined : 1, splitLine: { lineStyle: { color: p.grid, type: 'dashed' } }, axisLabel: { color: p.label2, formatter: group ? '{value}%' : '{value}' } },
      series: group
        ? [
            { name: 'TA', type: 'bar', data: t.hours.map((n) => pct(n, t.total)), itemStyle: { color: p.accent, borderRadius: [4, 4, 1, 1] }, barCategoryGap: '25%' },
            { name: '全群', type: 'line', data: group.hours.map((n) => pct(n, group.total)), smooth: true, showSymbol: false, lineStyle: { color: p.second, width: 2 }, itemStyle: { color: p.second } },
          ]
        : [{ name: '消息数', type: 'bar', data: t.hours, itemStyle: { color: p.accent, borderRadius: [4, 4, 1, 1] }, barCategoryGap: '25%' }],
    }),
    [t, group],
  )
  return <Chart option={option} height={220} />
}

function Weekdays({ t, group }: { t: Tally; group?: Tally }) {
  const option = useCallback(
    (p: Palette): EChartsOption => ({
      grid: { left: 2, right: 2, top: group ? 30 : 10, bottom: 2, containLabel: true },
      legend: group ? { top: 0, left: 0 } : undefined,
      tooltip: { trigger: 'axis', valueFormatter: group ? (v) => `${v}%` : undefined },
      xAxis: { type: 'category', data: WD_ORDER.map((d) => `周${WEEKDAYS[d]}`), axisLine: { lineStyle: { color: p.sep } }, axisTick: { show: false }, axisLabel: { color: p.label2 } },
      yAxis: { type: 'value', splitNumber: 4, minInterval: group ? undefined : 1, splitLine: { lineStyle: { color: p.grid, type: 'dashed' } }, axisLabel: { color: p.label2, formatter: group ? '{value}%' : '{value}' } },
      series: group
        ? [
            { name: 'TA', type: 'bar', data: WD_ORDER.map((d) => pct(t.weekdays[d], t.total)), itemStyle: { color: p.accent, borderRadius: [6, 6, 2, 2] }, barMaxWidth: 26 },
            { name: '全群', type: 'line', data: WD_ORDER.map((d) => pct(group.weekdays[d], group.total)), smooth: true, lineStyle: { color: p.second, width: 2 }, itemStyle: { color: p.second } },
          ]
        : [{ name: '消息数', type: 'bar', data: WD_ORDER.map((d) => t.weekdays[d]), itemStyle: { color: p.accent, borderRadius: [6, 6, 2, 2] }, barMaxWidth: 26 }],
    }),
    [t, group],
  )
  return <Chart option={option} height={220} />
}

function Heat({ t }: { t: Tally }) {
  const option = useCallback(
    (p: Palette): EChartsOption => {
      const data: [number, number, number][] = []
      WD_ORDER.forEach((d, col) => {
        for (let h = 0; h < 24; h++) data.push([col, 23 - h, t.heat[d * 24 + h]])
      })
      const max = Math.max(1, ...t.heat)
      return {
        grid: { left: 2, right: 4, top: 4, bottom: 36, containLabel: true },
        tooltip: {
          trigger: 'item',
          formatter: (x) => {
            const [c, r, n] = (x as unknown as { value: [number, number, number] }).value
            const h = 23 - r
            return `周${WEEKDAYS[WD_ORDER[c]]} ${h}:00–${h + 1}:00<br/><b>${n.toLocaleString()}</b> 条`
          },
        },
        xAxis: { type: 'category', position: 'top', data: WD_ORDER.map((d) => WEEKDAYS[d]), splitArea: { show: false }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: p.label2, fontSize: 12 } },
        yAxis: {
          type: 'category',
          data: Array.from({ length: 24 }, (_, i) => `${23 - i}:00`),
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: p.label2, interval: (i: number) => (23 - i) % 3 === 0 },
        },
        visualMap: { min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 140, itemWidth: 8, inRange: { color: p.heat }, textStyle: { color: p.label2 }, text: ['多', '少'] },
        series: [{ type: 'heatmap', data, itemStyle: { borderColor: p.cell, borderWidth: 2, borderRadius: 4 }, emphasis: { itemStyle: { borderColor: p.label, borderWidth: 1 } } }],
      }
    },
    [t],
  )
  return <Chart option={option} height={440} />
}

function Kinds({ t }: { t: Tally }) {
  const dark = useIsDark()
  const colors = palette(dark).kinds
  const items = KINDS.map(([k, label], i) => ({ k, label, n: t.kinds[k], color: colors[i] })).filter((x) => x.n)
  const option = useCallback(
    (p: Palette): EChartsOption => ({
      tooltip: { trigger: 'item', formatter: '{b}：{c} 条（{d}%）' },
      series: [
        {
          type: 'pie',
          radius: ['62%', '88%'],
          center: ['50%', '50%'],
          padAngle: 1.5,
          itemStyle: { borderRadius: 6 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 4 },
          data: KINDS.map(([k, label], i) => ({ name: label, value: t.kinds[k], itemStyle: { color: p.kinds[i] } })).filter((x) => x.value),
        },
      ],
    }),
    [t],
  )
  return (
    <Section title="消息类型">
      <div className="px-4 pt-4 pb-3">
        <div className="relative mx-auto w-full max-w-[220px]">
          <Chart option={option} height={200} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] leading-none font-bold tabular-nums">{count(t.total)}</span>
            <span className="mt-1 text-[12px] text-label2">条消息</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5">
          {items.map((x) => (
            <div key={x.k} className="flex min-w-0 items-center gap-2 text-[15px]">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: x.color }} />
              <span className="min-w-0 flex-1 truncate">{x.label}</span>
              <span className="shrink-0 text-label2 tabular-nums">{share(x.n, t.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ---- 排行

const TOP = 20
const FOLD = 10
const MEDALS = ['#ffb800', '#a1a1aa', '#c8783c']

function Top({ stats, users, chatKey }: { stats: ChatStats; users: Users; chatKey: string }) {
  const [open, setOpen] = useState(false)
  const rows = useMemo(
    () =>
      [...stats.users.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, TOP),
    [stats],
  )
  const max = rows[0]?.[1].total || 1
  const shown = open ? rows : rows.slice(0, FOLD)
  return (
    <Section title="发言排行" footer="点按成员查看 TA 的发言趋势。其余成员可在群资料里点开查看。">
      <div className="py-1">
        {shown.map(([id, u], i) => {
          const who = users[id]
          return (
            <button key={id} type="button" data-press onClick={() => navigate(paths.stats(chatKey, id))} className="list-row press-row flex w-full items-center gap-3 pl-3 text-left">
              <span className="w-6 shrink-0 text-center text-[15px] font-bold tabular-nums" style={{ color: MEDALS[i] ?? 'var(--label2)' }}>
                {i + 1}
              </span>
              <Avatar id={id} name={who?.name ?? '?'} src={who?.avatar} size={40} />
              <div className="list-line flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[16px]">{who?.name || '未知用户'}</span>
                    <span className="shrink-0 text-[14px] font-semibold tabular-nums">{count(u.total)}</span>
                    <span className="w-12 shrink-0 text-right text-[12px] text-label2 tabular-nums">{pct(u.total, stats.group.total)}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill">
                    <div className="h-full origin-left rounded-full bg-accent" style={{ width: `${Math.max(2, (u.total / max) * 100)}%`, opacity: i < 3 ? 1 : 0.7 }} />
                  </div>
                </div>
                <ChevronRight className="shrink-0 text-label3" />
              </div>
            </button>
          )
        })}
        {rows.length > FOLD && (
          <button type="button" data-press onClick={() => setOpen((o) => !o)} className="press-row flex h-11 w-full items-center justify-center gap-1 text-[15px] font-medium text-accent">
            {open ? '收起' : `显示前 ${rows.length} 名`}
            <ChevronDown size={16} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
    </Section>
  )
}
