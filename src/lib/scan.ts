import { getChunk } from './api'
import { yieldToMain } from './idle'
import type { ChatMeta, Message } from './types'

export const MEDIA_KINDS: { key: string; label: string; test: (m: Message) => boolean }[] = [
  { key: 'photo', label: '图片', test: (m) => m.media?.type === 'photo' },
  { key: 'video', label: '视频', test: (m) => ['video', 'gif', 'round'].includes(m.media?.type ?? '') },
  { key: 'file', label: '文件', test: (m) => m.media?.type === 'file' || m.media?.type === 'audio' },
  { key: 'link', label: '链接', test: (m) => m.media?.type === 'webpage' || !!m.ents?.some((e) => e[0] === 'a' || e[0] === 'url') },
  { key: 'voice', label: '语音', test: (m) => m.media?.type === 'voice' },
]

export const norm = (s: string) => s.normalize('NFKC').toLowerCase()

function haystack(m: Message): string {
  const md = m.media
  const links = m.ents?.filter((e) => e[0] === 'a' && typeof e[3] === 'string').map((e) => e[3] as string) ?? []
  const parts = [m.text, md?.name, md?.title, md?.desc, md?.performer, md?.site, md?.url, md?.poll?.q, ...(md?.poll?.opts.map((o) => o.t) ?? []), ...links]
  return parts.filter(Boolean).join('\n')
}

const hayCache = new WeakMap<Message, [string, string]>()
export function hayOf(m: Message): [string, string] {
  let h = hayCache.get(m)
  if (!h) {
    const raw = haystack(m)
    h = [raw, norm(raw)]
    hayCache.set(m, h)
  }
  return h
}

const PARALLEL = 4
const YIELD_EVERY = 100

export async function* scanBatches(meta: ChatMeta, opts: { oldestFirst?: boolean } = {}): AsyncGenerator<{ msgs: Message[]; progress: number }> {
  const order = opts.oldestFirst ? meta.chunks : [...meta.chunks].reverse()
  await yieldToMain()
  for (let i = 0; i < order.length; i += PARALLEL) {
    const batch = await Promise.all(order.slice(i, i + PARALLEL).map((c) => getChunk(meta.id, c.n)))
    for (let j = 0; j < batch.length; j++) {
      const msgs = opts.oldestFirst ? batch[j] : [...batch[j]].reverse()
      yield { msgs, progress: Math.min(1, (i + j + 1) / order.length) }
    }
  }
}

export async function scanChat(
  meta: ChatMeta,
  visit: (m: Message) => boolean | void,
  opts: { alive?: () => boolean; onProgress?: (p: number) => void; oldestFirst?: boolean } = {},
): Promise<boolean> {
  const alive = opts.alive ?? (() => true)
  for await (const { msgs, progress } of scanBatches(meta, opts)) {
    for (let k = 0; k < msgs.length; k++) {
      if (k % YIELD_EVERY === 0) {
        await yieldToMain()
        if (!alive()) return false
      }
      if (visit(msgs[k]) === false) return true
    }
    opts.onProgress?.(progress)
  }
  return alive()
}
