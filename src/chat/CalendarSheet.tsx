import { createContext, useContext, useMemo, useState } from 'react'
import { DayPicker, type DayButtonProps, type MonthCaptionProps } from 'react-day-picker'
import { zhCN } from 'react-day-picker/locale'
import { ChevronLeft, ChevronRight } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { dayKey, pad, parts } from '../lib/format'

interface Props {
  open: boolean
  onClose: () => void
  days: Record<string, [number, number]>
  firstDate?: number
  lastDate?: number
  current?: number
  onPick: (msgId: number) => void
}

const dateOf = (ts: number) => {
  const p = parts(ts)
  return new Date(p.y, p.m - 1, p.d)
}
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

const monthPrefix = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-`

const Ctx = createContext<{ days: Props['days']; max: number; pick: (key: string) => void }>({ days: {}, max: 1, pick: () => {} })

function MonthCaption({ calendarMonth, displayIndex: _i, ...rest }: MonthCaptionProps) {
  const { days, pick } = useContext(Ctx)
  const d = calendarMonth.date
  const keys = Object.keys(days).filter((k) => k.startsWith(monthPrefix(d)))
  const n = keys.reduce((a, k) => a + days[k][1], 0)
  return (
    <div {...rest} className="flex h-14 items-center">
      <button onClick={() => n && pick(keys.sort()[0])} disabled={!n} className="text-left disabled:opacity-100">
        <div className="text-[20px] font-semibold">
          {d.getFullYear()}年{d.getMonth() + 1}月
        </div>
        <div className="text-[13px] text-label2">{n ? `${n} 条消息` : '无消息'}</div>
      </button>
    </div>
  )
}

function DayButton({ day, modifiers, className: _c, style: _s, ...rest }: DayButtonProps) {
  const { days, max } = useContext(Ctx)
  const info = days[keyOf(day.date)]
  const intensity = info ? 0.15 + 0.6 * Math.sqrt(info[1] / max) : 0
  return (
    <button
      {...rest}
      title={info ? `${info[1]} 条消息` : undefined}
      className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full text-[18px] leading-none disabled:text-label3 ${modifiers.today ? 'font-bold text-accent' : ''} ${info && intensity > 0.5 ? 'text-white' : ''}`}
      style={info ? { background: `color-mix(in srgb, var(--accent) ${Math.round(intensity * 100)}%, transparent)` } : undefined}
    />
  )
}

const Chevron = ({ orientation }: { orientation?: string }) => (orientation === 'left' ? <ChevronLeft size={22} /> : <ChevronRight size={22} />)

export function CalendarSheet({ open, onClose, days, firstDate, lastDate, current, onPick }: Props) {
  const now = Date.now() / 1000
  const first = monthStart(dateOf(firstDate ?? now))
  const last = monthStart(dateOf(lastDate ?? firstDate ?? now))
  const [month, setMonth] = useState(() => monthStart(dateOf(current ?? lastDate ?? now)))
  const [openedWith, setOpenedWith] = useState(open)
  if (open !== openedWith) {
    setOpenedWith(open)
    if (open) setMonth(monthStart(dateOf(current ?? lastDate ?? now)))
  }

  const max = useMemo(() => Math.max(1, ...Object.values(days).map((d) => d[1])), [days])
  const todayKey = dayKey(now)
  const today = new Date(+todayKey.slice(0, 4), +todayKey.slice(5, 7) - 1, +todayKey.slice(8, 10))

  const pick = (key: string) => {
    const d = days[key]
    if (!d) return
    onClose()
    onPick(d[0])
  }
  return (
    <Sheet open={open} onClose={onClose} title="跳转到日期">
      <div className="px-4 pb-5">
        <Ctx.Provider value={{ days, max, pick }}>
          <DayPicker
            locale={zhCN}
            weekStartsOn={1}
            month={month}
            onMonthChange={setMonth}
            startMonth={first}
            endMonth={last}
            today={today}
            disabled={(d) => !days[keyOf(d)]}
            onDayClick={(d, m) => !m.disabled && pick(keyOf(d))}
            components={{ MonthCaption, DayButton, Chevron }}
            classNames={{
              root: 'relative',
              months: 'relative',
              nav: 'absolute top-2 right-0 z-10 flex gap-1',
              button_previous: 'flex h-10 w-10 items-center justify-center rounded-full text-accent disabled:text-label3',
              button_next: 'flex h-10 w-10 items-center justify-center rounded-full text-accent disabled:text-label3',
              month_grid: 'w-full border-collapse',
              weekdays: 'text-center text-[13px] font-medium text-label3',
              weekday: 'py-1.5 font-medium',
              week: 'text-center',
              day: 'py-0.5',
            }}
          />
        </Ctx.Provider>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              const k = Object.keys(days).sort()[0]
              if (k) pick(k)
            }}
            data-press className="glass-press h-12 flex-1 rounded-full bg-cell text-[16px] font-medium text-accent"
          >
            最早的消息
          </button>
          <button
            onClick={() => {
              const ks = Object.keys(days).sort()
              if (ks.length) pick(ks[ks.length - 1])
            }}
            data-press className="glass-press h-12 flex-1 rounded-full bg-cell text-[16px] font-medium text-accent"
          >
            最近的消息
          </button>
        </div>
      </div>
    </Sheet>
  )
}
