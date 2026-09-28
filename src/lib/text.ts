import type { ChatSummary, Message, Service, User, Users } from './types'

/** 匿名管理员以群组身份发言：保证群组自身有名字和头像（兼容旧存档） */
export function withChat(users: Users, chat: ChatSummary): Users {
  const key = String(chat.id)
  const cur = users[key]
  return { ...users, [key]: { ...cur, name: cur?.name || chat.title, avatar: cur?.avatar || chat.avatar, chat: true } }
}

export interface SenderTitle {
  text: string
  /** 匿名管理员和所有者为紫色，其他管理员为绿色 */
  owner: boolean
}

/** 名字旁显示的头衔：匿名管理员用消息签名，其余用管理员头衔 */
export function senderTitle(m: Message, users: Users, chatId: number): SenderTitle | undefined {
  if (m.from == null) return undefined
  if (m.from === chatId) return { text: m.sig || users[String(chatId)]?.title || '匿名管理员', owner: true }
  return userTitle(users[String(m.from)])
}

export function userTitle(u: User | undefined): SenderTitle | undefined {
  if (!u?.title) return undefined
  // 旧存档没有 role 字段，按默认头衔判断
  const owner = u.role ? u.role === 'owner' : u.title === '所有者' || u.title === '群主'
  return { text: u.title, owner }
}

export function userName(users: Users | undefined, id: number | null | undefined): string {
  if (id == null) return ''
  return users?.[String(id)]?.name || '未知用户'
}

const MEDIA_LABELS: Record<string, string> = {
  photo: '图片',
  video: '视频',
  gif: 'GIF',
  sticker: '贴纸',
  voice: '语音消息',
  round: '视频消息',
  audio: '音频',
  file: '文件',
  poll: '投票',
  geo: '位置',
  venue: '位置',
  contact: '联系人',
  dice: '骰子',
  game: '游戏',
  invoice: '账单',
  unsupported: '不支持的消息',
}

export function mediaLabel(m: Message): string {
  const media = m.media
  if (!media || media.type === 'webpage') return ''
  if (media.type === 'sticker') return `${media.emoji ?? ''} 贴纸`.trim()
  if (media.type === 'poll') return `📊 ${media.poll?.q ?? '投票'}`
  if (media.type === 'file' && media.name) return `📎 ${media.name}`
  if (media.type === 'audio') return `🎵 ${[media.performer, media.title].filter(Boolean).join(' - ') || media.name || '音频'}`
  return MEDIA_LABELS[media.type] ?? ''
}

export function serviceText(svc: Service, actor: string, users?: Users, pinned?: string): string {
  const list = (ids?: number[]) => (ids ?? []).map((i) => userName(users, i)).join('、')
  switch (svc.type) {
    case 'join':
      return `${actor} 加入了群组`
    case 'add':
      return `${actor} 邀请了 ${list(svc.users)}`
    case 'leave':
      return `${actor} 离开了群组`
    case 'kick':
      return `${actor} 移除了 ${list(svc.users)}`
    case 'title':
      return `${actor} 将群名称修改为「${svc.title}」`
    case 'photo':
      return `${actor} 更新了群头像`
    case 'photo_del':
      return `${actor} 删除了群头像`
    case 'pin':
      return pinned ? `${actor} 置顶了「${pinned}」` : `${actor} 置顶了一条消息`
    case 'create':
      return `${actor} 创建了群组「${svc.title}」`
    case 'migrate':
      return '群组已升级为超级群组'
    case 'call':
      return svc.dur ? `语音聊天已结束（${Math.round(svc.dur / 60)} 分钟）` : `${actor} 发起了语音聊天`
    case 'call_scheduled':
      return `${actor} 预约了语音聊天`
    case 'call_invite':
      return `${actor} 邀请 ${list(svc.users)} 加入语音聊天`
    case 'ttl':
      return svc.period ? `${actor} 开启了消息自动删除（${Math.round(svc.period / 86400)} 天）` : `${actor} 关闭了消息自动删除`
    case 'topic_create':
      return `${actor} 创建了话题「${svc.title}」`
    case 'topic_edit':
      return `${actor} 修改了话题${svc.title ? `「${svc.title}」` : ''}`
    case 'clear':
      return '聊天记录已清空'
    case 'screenshot':
      return `${actor} 截取了屏幕`
    case 'custom':
      return svc.text ?? ''
    default:
      return `${actor} [${svc.name ?? '系统消息'}]`
  }
}

/** 一行消息预览 */
export function previewOf(m: Message, users?: Users): string {
  if (m.svc) return serviceText(m.svc, userName(users, m.from), users, m.reply?.text)
  const label = mediaLabel(m)
  const text = (m.text ?? '').replace(/\s+/g, ' ').trim()
  if (label && text) return `${label}，${text}`
  return text || label || (m.media?.type === 'webpage' ? m.media.url ?? '' : '')
}

/** 用户名配色（Telegram 风格的 7 色） */
export const PEER_COLORS: [string, string][] = [
  ['#FF885E', '#FF516A'],
  ['#FFCD6A', '#FFA85C'],
  ['#82B1FF', '#665FFF'],
  ['#A0DE7E', '#54CB68'],
  ['#53EDD6', '#28C9B7'],
  ['#72D5FD', '#2A9EF1'],
  ['#E0A2F3', '#D669ED'],
]

export function colorIndex(id: number | string): number {
  const n = typeof id === 'number' ? id : [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return Math.abs(n) % 7
}

export function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const words = trimmed.split(/\s+/)
  const first = [...words[0]][0] ?? ''
  if (/[㐀-鿿]/.test(first)) return first
  const second = words.length > 1 ? [...words[words.length - 1]][0] ?? '' : ''
  return (first + second).toUpperCase()
}

export function activeMembers(users: Users, include?: number): [string, User][] {
  return Object.entries(users)
    .filter(([id, u]) => (u.count ?? 0) > 0 || Number(id) === include)
    .sort((a, b) => (b[1].count ?? 0) - (a[1].count ?? 0))
}

export function memberTitle(u: User, isChat: boolean): SenderTitle | undefined {
  return isChat ? { text: u.title || '匿名管理员', owner: true } : userTitle(u)
}
