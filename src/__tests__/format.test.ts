import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { count, dayKey, dayLabel, duration, fileSize, fullDate, parts, relative, setTimeZone, shortDate, timeOf } from '../lib/format'

// 2024-03-05 12:34:56 UTC（周二）
const T = Date.UTC(2024, 2, 5, 12, 34, 56) / 1000

describe('format: 时区与日期', () => {
  afterEach(() => setTimeZone('Asia/Shanghai'))

  it('默认 Asia/Shanghai', () => {
    expect(dayKey(T)).toBe('2024-03-05')
    expect(timeOf(T)).toBe('20:34')
    expect(fullDate(T)).toBe('2024年3月5日 20:34')
    expect(fullDate(T, false)).toBe('2024年3月5日')
    expect(parts(T)).toEqual({ y: 2024, m: 3, d: 5, hh: '20', mm: '34', wd: 2 })
  })

  it('跨日：UTC 16:30 在上海是次日', () => {
    const t = Date.UTC(2024, 2, 5, 16, 30) / 1000
    expect(dayKey(t)).toBe('2024-03-06')
    expect(timeOf(t)).toBe('00:30')
  })

  it('切换时区、夏令时', () => {
    setTimeZone('America/New_York')
    // 2024-03-10 夏令时开始（02:00 → 03:00）
    expect(timeOf(Date.UTC(2024, 2, 10, 6, 59) / 1000)).toBe('01:59')
    expect(timeOf(Date.UTC(2024, 2, 10, 7, 0) / 1000)).toBe('03:00')
    expect(dayKey(Date.UTC(2024, 2, 10, 3, 0) / 1000)).toBe('2024-03-09')
  })

  it('无效时区保持原设置', () => {
    setTimeZone('Not/AZone')
    expect(timeOf(T)).toBe('20:34')
  })
})

describe('format: 相对时间', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(T * 1000))
  })
  afterEach(() => vi.useRealTimers())

  it('dayLabel', () => {
    expect(dayLabel(T)).toBe('今天')
    expect(dayLabel(T - 86400)).toBe('昨天')
    expect(dayLabel(T - 3 * 86400)).toBe('3月2日 星期六')
    expect(dayLabel(T - 400 * 86400)).toBe('2023年1月30日')
  })

  it('shortDate', () => {
    expect(shortDate(T - 60)).toBe('20:33')
    expect(shortDate(T - 2 * 86400)).toBe('星期日')
    expect(shortDate(T - 10 * 86400)).toBe('2/24')
    expect(shortDate(T - 400 * 86400)).toBe('23/1/30')
  })

  it('relative', () => {
    expect(relative(T - 5)).toBe('刚刚')
    expect(relative(T - 125)).toBe('2分钟前')
    expect(relative(T - 7200)).toBe('2小时前')
    expect(relative(T - 3 * 86400)).toBe('3天前')
    expect(relative(T - 40 * 86400)).toBe('2024年1月25日')
  })
})

describe('format: 数值', () => {
  it('fileSize', () => {
    expect(fileSize(undefined)).toBe('')
    expect(fileSize(0)).toBe('')
    expect(fileSize(512)).toBe('512 B')
    expect(fileSize(1536)).toBe('1.5 KB')
    expect(fileSize(150 * 1024)).toBe('150 KB')
    expect(fileSize(5 * 1024 ** 3)).toBe('5 GB')
    expect(fileSize(5000 * 1024 ** 3)).toBe('4.9 TB')
  })

  it('duration', () => {
    expect(duration(undefined)).toBe('')
    expect(duration(0)).toBe('0:00')
    expect(duration(65)).toBe('1:05')
    expect(duration(3725.9)).toBe('1:02:05')
  })

  it('count', () => {
    expect(count(undefined)).toBe('')
    expect(count(9999)).toBe('9999')
    expect(count(12345)).toBe('1.2万')
    expect(count(123456789)).toBe('1.2亿')
    expect(count(10000)).toBe('1万')
  })
})
