import type { MenuAction } from '../components/ContextMenu'
import { CheckCircle, Comment, Copy, Download, External, Link, Person, Reply, Search, Share } from '../components/Icons'
import { copyText } from '../components/Toast'
import { telegramLink } from '../lib/api'
import { paths } from '../lib/router'
import { openExternal, saveImage, shareText } from '../lib/share'
import { userName } from '../lib/text'
import type { ChatMeta, Message, Users } from '../lib/types'

interface Ctx {
  meta: ChatMeta
  users: Users
  messages: Message[]
  replies?: number
  itemKey: number
  onSelect: (key: number) => void
  onThread: (id: number) => void
  onJump: (id: number, source: number) => void
  onProfile: (id: number) => void
  onSearchFrom: (id: number) => void
}

export function messageMenu(m: Message, ctx: Ctx): MenuAction[][] {
  const { meta } = ctx
  const link = `${location.origin}${location.pathname}#${paths.chat(meta.username ?? meta.id, m.id)}`
  const copy: MenuAction[] = []
  if (m.text) copy.push({ label: '复制文字', icon: <Copy size={20} />, onClick: () => void copyText(m.text!) })
  copy.push({ label: '复制消息链接', icon: <Link size={20} />, onClick: () => void copyText(link, '链接已复制') })
  copy.push({ label: '分享', icon: <Share size={20} />, onClick: () => void shareText(m.text?.slice(0, 300) ?? '', link, meta.title) })
  const photo = [m, ...ctx.messages.filter((x) => x.group && x.group === m.group)].find((x) => x.media?.type === 'photo' && x.media.file)
  if (photo) copy.push({ label: '保存图片', icon: <Download size={20} />, onClick: () => void saveImage(photo.media!.file!, `${meta.title}-${photo.id}`) })
  copy.push({ label: '选择', icon: <CheckCircle size={20} />, onClick: () => ctx.onSelect(ctx.itemKey) })

  const nav: MenuAction[] = []
  if (ctx.replies) nav.push({ label: `查看回复（${ctx.replies}）`, icon: <Comment size={20} />, onClick: () => ctx.onThread(m.id) })
  if (m.reply && !m.reply.ext) nav.push({ label: '查看被回复的消息', icon: <Reply size={20} />, onClick: () => ctx.onJump(m.reply!.id, m.id) })
  if (m.from != null) {
    const from = m.from
    const who = userName(ctx.users, from)
    nav.push({ label: `查看 ${who} 的资料`, icon: <Person size={20} />, onClick: () => ctx.onProfile(from) })
    nav.push({ label: `搜索 ${who} 的消息`, icon: <Search size={20} />, onClick: () => ctx.onSearchFrom(from) })
  }

  const tg = telegramLink(meta, m.id)
  const ext: MenuAction[] = tg ? [{ label: '在 Telegram 中打开', icon: <External size={20} />, onClick: () => openExternal(tg) }] : []
  return [copy, nav, ext].filter((g) => g.length)
}
