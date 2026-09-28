import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chunkFor, dataUrl, getChunk, getMessage, peekChat, peekChunk, resolveChat, telegramLink } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { scanBatches, scanChat } from '../lib/scan'
import type { ChatMeta } from '../lib/types'
import type { ChunkInfo } from '../lib/types'

const chunk = (n: number, min: number, max: number): ChunkInfo => ({ n, min, max, from: 0, to: 0, count: max - min + 1 })
const CHUNKS = [chunk(0, 1, 10), chunk(1, 11, 20), chunk(2, 25, 30)]

const files: Record<string, unknown> = {
  '/data/index.json': { title: 't', timezone: 'UTC', chats: [{ id: -1001, title: 'A', username: 'FooBar' }, { id: 5, title: 'B' }] },
  '/data/chats/-1001/messages/0.json': [
    { id: 1, date: 0, text: 'anon' },
    { id: 2, date: 0, from: 7, text: 'x', reply: { id: 1, text: 'anon' } },
    { id: 3, date: 0, svc: { type: 'join' } },
    { id: 4, date: 0, from: 7, reply: { id: 99, ext: true, text: 'e' } },
    { id: 5, date: 0, from: 7, reply: { id: 98 } },
  ],
  '/data/chats/5/messages/0.json': [{ id: 1, date: 0, text: 'private' }],
  '/data/chats/9/messages/0.json': [{ id: 1, date: 0 }, { id: 2, date: 0 }],
  '/data/chats/9/messages/1.json': [{ id: 3, date: 0 }],
  '/data/chats/9/messages/2.json': [{ id: 4, date: 0 }, { id: 5, date: 0 }],
}

beforeEach(() => {
  queryClient.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = files[decodeURIComponent(url)]
      return body === undefined
        ? { ok: false, status: 404, statusText: 'Not Found', json: async () => null }
        : { ok: true, status: 200, statusText: 'OK', json: async () => structuredClone(body) }
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('dataUrl 逐段编码', () => {
    expect(dataUrl('chats/-1/a b#.jpg')).toBe('/data/chats/-1/a%20b%23.jpg')
  })

  it('chunkFor 二分查找（含越界与空洞）', () => {
    expect(chunkFor(CHUNKS, 1)).toBe(0)
    expect(chunkFor(CHUNKS, 10)).toBe(0)
    expect(chunkFor(CHUNKS, 11)).toBe(1)
    expect(chunkFor(CHUNKS, 22)).toBe(2)
    expect(chunkFor(CHUNKS, 999)).toBe(2)
    expect(chunkFor(CHUNKS, -5)).toBe(0)
    expect(chunkFor([], 5)).toBe(0)
  })

  it('telegramLink', () => {
    expect(telegramLink({ id: 1, title: '', username: 'u' }, 5)).toBe('https://t.me/u/5')
    expect(telegramLink({ id: 1, title: '', username: 'u' })).toBe('https://t.me/u')
    expect(telegramLink({ id: -1001234567890, title: '' }, 5)).toBe('https://t.me/c/1234567890/5')
    expect(telegramLink({ id: -1001234567890, title: '' })).toBe('https://t.me/c/1234567890/1')
    expect(telegramLink({ id: -5, title: '' })).toBeUndefined()
  })

  it('resolveChat / peekChat：数字 id 或忽略大小写的 username', async () => {
    expect(peekChat('foobar')).toBeUndefined()
    expect((await resolveChat('foobar'))?.id).toBe(-1001)
    expect((await resolveChat('-1001'))?.id).toBe(-1001)
    expect((await resolveChat('5'))?.id).toBe(5)
    expect(await resolveChat('nope')).toBeUndefined()
    expect(peekChat('FOOBAR')?.id).toBe(-1001)
    expect(peekChat('nope')).toBeUndefined()
  })

  it('getChunk：超级群匿名消息补 from，服务消息、外部回复、无文字回复不补', async () => {
    const msgs = await getChunk(-1001, 0)
    expect(msgs[0].from).toBe(-1001)
    expect(msgs[1].reply?.from).toBe(-1001)
    expect(msgs[2].from).toBeUndefined()
    expect(msgs[3].reply?.from).toBeUndefined()
    expect(msgs[4].reply?.from).toBeUndefined()
    expect(peekChunk(-1001, 0)?.[0].from).toBe(-1001)
    expect(peekChunk(-1001, 1)).toBeUndefined()
  })

  it('getChunk：私聊（正 id）不补 from', async () => {
    expect((await getChunk(5, 0))[0].from).toBeUndefined()
  })

  it('getMessage / 失败时报错', async () => {
    expect((await getMessage(-1001, [chunk(0, 1, 5)], 2))?.text).toBe('x')
    expect(await getMessage(-1001, [], 2)).toBeUndefined()
    await expect(getChunk(-1001, 7)).rejects.toThrow('404 Not Found')
  })
})

describe('scan', () => {
  const meta = { id: 9, chunks: [chunk(0, 1, 2), chunk(1, 3, 3), chunk(2, 4, 5)] } as ChatMeta
  const collect = async (oldestFirst: boolean) => {
    const out: [number[], number][] = []
    for await (const { msgs, progress } of scanBatches(meta, { oldestFirst })) out.push([msgs.map((m) => m.id), Math.round(progress * 100)])
    return out
  }

  it('scanBatches 按块产出、块内顺序与方向一致、进度递增', async () => {
    expect(await collect(false)).toEqual([[[5, 4], 33], [[3], 67], [[2, 1], 100]])
    expect(await collect(true)).toEqual([[[1, 2], 33], [[3], 67], [[4, 5], 100]])
  })

  it('scanChat 可提前停止，alive 为假时返回 false', async () => {
    const seen: number[] = []
    expect(await scanChat(meta, (m) => (seen.push(m.id), m.id !== 3))).toBe(true)
    expect(seen).toEqual([5, 4, 3])
    expect(await scanChat(meta, () => {}, { alive: () => false })).toBe(false)
  })
})
