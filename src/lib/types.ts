
export type Entity = [type: string, offset: number, length: number, extra?: string | number]

export interface PollData {
  q: string
  opts: { t: string; n?: number }[]
  total?: number
  closed?: boolean
  quiz?: boolean
}

export type MediaType =
  | 'photo' | 'video' | 'gif' | 'sticker' | 'voice' | 'round' | 'audio' | 'file'
  | 'webpage' | 'poll' | 'geo' | 'venue' | 'contact' | 'dice' | 'game' | 'invoice' | 'unsupported'

export interface Media {
  type: MediaType
  file?: string
  thumb?: string
  skip?: 'type' | 'size' | 'error'
  w?: number
  h?: number
  size?: number
  mime?: string
  dur?: number
  name?: string
  title?: string
  performer?: string
  emoji?: string
  animated?: boolean
  spoiler?: boolean
  url?: string
  site?: string
  desc?: string
  poll?: PollData
  lat?: number
  lng?: number
  address?: string
  value?: number
  note?: string
  wave?: number[]
}

export interface Service {
  type: string
  users?: number[]
  title?: string
  dur?: number
  at?: number
  period?: number
  text?: string
  name?: string
}

export interface ReplyPreview {
  id: number
  from?: number | null
  text?: string
  quote?: string
  ext?: boolean
}

export interface Message {
  id: number
  date: number
  from?: number
  text?: string
  ents?: Entity[]
  media?: Media
  reply?: ReplyPreview
  fwd?: { name: string; date?: number }
  edit?: number
  group?: string
  sig?: string
  via?: string
  reacts?: [string, number][]
  views?: number
  svc?: Service
  topic?: number
}

export interface User {
  name: string
  username?: string
  avatar?: string
  bot?: boolean
  chat?: boolean
  title?: string
  role?: 'owner' | 'admin'
  count?: number
  bio?: string
  premium?: boolean
  verified?: boolean
  scam?: boolean
  fake?: boolean
  deleted?: boolean
}

export type Users = Record<string, User>

export interface ChunkInfo {
  n: number
  min: number
  max: number
  from: number
  to: number
  count: number
}

export interface LastPreview {
  id: number
  from?: number | null
  name?: string
  text: string
  svc?: Service
}

export interface ChatSummary {
  id: number
  title: string
  username?: string
  avatar?: string
  type?: string
  members?: number
  count?: number
  firstDate?: number
  lastDate?: number
  updatedAt?: number
  last?: LastPreview
}

export interface Topic {
  id: number
  title: string
  color?: string
  pinned?: boolean
  closed?: boolean
  hidden?: boolean
  last?: { id: number; date: number; from?: number | null; text: string }
}

export interface ChatMeta extends ChatSummary {
  about?: string
  forum?: boolean
  pins?: number[]
  topics?: Topic[]
  firstId?: number
  lastId?: number
  chunkSize?: number
  chunks: ChunkInfo[]
  days: Record<string, [number, number]>
}

export interface SiteIndex {
  title: string
  timezone: string
  updatedAt?: number
  chats: ChatSummary[]
}
