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
      }
    },
    removeItem(name) {
      try {
        area(where)?.removeItem(name)
      } catch {
      }
    },
  }
}

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
