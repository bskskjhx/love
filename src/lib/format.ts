import { filesize } from 'filesize'


let timeZone = 'Asia/Shanghai'
const formatters = new Map<string, Intl.DateTimeFormat>()

export function setTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('zh-CN', { timeZone: tz })
    timeZone = tz
    formatters.clear()
    offsets.clear()
  } catch {
  }
}

interface Parts {
  y: number
  m: number
  d: number
  hh: string
  mm: string
  wd: number
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function fmt() {
  let f = formatters.get('parts')
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set('parts', f)
  }
  return f
}

const offsets = new Map<number, number>()

function offsetAt(ts: number): number {
  const b = Math.floor(ts / 900)
  let o = offsets.get(b)
  if (o == null) {
    const start = b * 900
    const p: Record<string, string> = {}
    for (const x of fmt().formatToParts(start * 1000)) p[x.type] = x.value
    o = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000 - start
    offsets.set(b, o)
  }
  return o
}

const pad = (n: number) => String(n).padStart(2, '0')

export function parts(ts: number): Parts {
  const d = new Date((ts + offsetAt(ts)) * 1000)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), wd: d.getUTCDay() }
}

export function dayKey(ts: number): string {
  const p = parts(ts)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

export function timeOf(ts: number): string {
  const p = parts(ts)
  return `${p.hh}:${p.mm}`
}

const now = () => Math.floor(Date.now() / 1000)

export function dayLabel(ts: number): string {
  const p = parts(ts)
  const key = dayKey(ts)
  if (key === dayKey(now())) return '今天'
  if (key === dayKey(now() - 86400)) return '昨天'
  const md = `${p.m}月${p.d}日`
  if (p.y === parts(now()).y) return `${md} 星期${WEEKDAYS[p.wd]}`
  return `${p.y}年${md}`
}

export function shortDate(ts: number): string {
  const p = parts(ts)
  const n = now()
  if (dayKey(ts) === dayKey(n)) return `${p.hh}:${p.mm}`
  if (n - ts < 6 * 86400) return `星期${WEEKDAYS[p.wd]}`
  if (p.y === parts(n).y) return `${p.m}/${p.d}`
  return `${String(p.y).slice(2)}/${p.m}/${p.d}`
}

export function fullDate(ts: number, withTime = true): string {
  const p = parts(ts)
  const d = `${p.y}年${p.m}月${p.d}日`
  return withTime ? `${d} ${p.hh}:${p.mm}` : d
}

const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'always' })

export function relative(ts: number): string {
  const diff = now() - ts
  if (diff < 60) return '刚刚'
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute')
  if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour')
  if (diff < 86400 * 30) return rtf.format(-Math.floor(diff / 86400), 'day')
  return fullDate(ts, false)
}

export function fileSize(bytes?: number): string {
  if (!bytes) return ''
  return filesize(bytes, { base: 2, standard: 'jedec', round: 1 })
}

export function duration(sec?: number): string {
  if (sec == null) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })

export function count(n?: number): string {
  if (n == null) return ''
  return compact.format(n)
}

export { WEEKDAYS, pad }
