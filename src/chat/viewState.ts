import { perChat } from '../lib/store'
import type { Message } from '../lib/types'

export interface Loaded {
  n: number
  msgs: Message[]
}

export type Target =
  | { kind: 'bottom' }
  | { kind: 'msg'; id: number; align: 'center' | 'start' | 'offset'; offset?: number; flash?: boolean; unread?: boolean }

interface StoredPos {
  id?: number
  offset?: number
  bottom?: boolean
  route?: number
}

export const positions = perChat<StoredPos>('chatPositions')
