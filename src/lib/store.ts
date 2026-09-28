import { createStore } from 'zustand/vanilla'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'

type Area = 'local' | 'session'

const area = (where: Area): Storage | null => {
  try {
    return where === 'local' ? localStorage : sessionStorage
  } catch {
    return null
  }
}

/**
 * zustand persist 的存储：写入 zustand 的标准格式；读取时兼容旧版直接存的值（纯 JSON 或纯字符串），
 * 用 fromLegacy 转成当前状态，升级后本机的设置、阅读进度都不会丢。隐私模式下读写失败时静默忽略。
 */
export function persistStorage<S>(where: Area, fromLegacy: (value: unknown) => S): PersistStorage<S> {
  return {
    getItem(name) {
      const raw = area(where)?.getItem(name)
      if (raw == null) return null
      let value: unknown
      try {
        value = JSON.parse(raw)
      } catch {
        value = raw
      }
      if (value && typeof value === 'object' && 'state' in value) return value as StorageValue<S>
      return { state: fromLegacy(value), version: 0 }
    },
    setItem(name, value) {
      try {
        area(where)?.setItem(name, JSON.stringify(value))
      } catch {
        /* 空间不足或隐私模式 */
      }
    },
    removeItem(name) {
      try {
        area(where)?.removeItem(name)
      } catch {
        /* 同上 */
      }
    },
  }
}

/** 按群（或其它 id）存取的一组持久化记录，基于 zustand persist */
export function perChat<T>(key: string, where: Area = 'local') {
  const store = createStore<Record<string, T>>()(
    persist(() => ({}), { name: key, storage: persistStorage(where, (v) => (v && typeof v === 'object' ? (v as Record<string, T>) : {})) }),
  )
  return {
    get: (id: number | string): T | undefined => store.getState()[id],
    set(id: number | string, value: T | undefined) {
      const next = { ...store.getState() }
      if (value === undefined) delete next[id]
      else next[id] = value
      store.setState(next, true)
    },
  }
}
