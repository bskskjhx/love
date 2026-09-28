import { Fragment } from 'react'
import { Avatar } from '../components/Avatar'
import { Sheet } from '../components/Sheet'
import { copyText } from '../components/Toast'
import { dataUrl } from '../lib/api'
import { navigate, paths } from '../lib/router'
import { openExternal } from '../lib/share'
import { count } from '../lib/format'
import { memberTitle } from '../lib/text'
import type { ChatMeta, Users } from '../lib/types'
import { TitleBadge } from './MessageItem'
import { AtSign, ChartColumn, Hash, Images, Info, MessageSquareText, Send } from 'lucide-react'
import { ActionTile, Card, IconBadge, Row } from '../components/List'

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|@[A-Za-z0-9_]{4,32})/g)
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>
        const href = p.startsWith('@') ? `https://t.me/${p.slice(1)}` : p
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-accent">
            {p}
          </a>
        )
      })}
    </>
  )
}

export function profileLinks(chatKey: string, close: () => void) {
  return {
    onSearch: (id: number) => {
      close()
      navigate(paths.search(chatKey, '', id))
    },
    onStats: (id: number) => {
      close()
      navigate(paths.stats(chatKey, id))
    },
    onMedia: (id: number) => {
      close()
      navigate(paths.media(chatKey, undefined, id))
    },
  }
}

export function ProfileSheet({
  id,
  users,
  meta,
  onClose,
  onSearch,
  onChatInfo,
  onMedia,
  onStats,
}: {
  id: number | null
  users: Users
  meta: ChatMeta
  onClose: () => void
  onSearch: (id: number) => void
  onChatInfo: () => void
  onMedia?: (id: number) => void
  onStats?: (id: number) => void
}) {
  const u = id != null ? users[String(id)] : undefined
  const isChat = id === meta.id
  const title = u ? memberTitle(u, isChat) : undefined
  const bio = u?.bio || (isChat ? meta.about : undefined)
  const tg = u?.username ? `https://t.me/${u.username}` : undefined
  const flags = u
    ? [u.bot && '机器人', u.verified && '已认证', u.premium && 'Premium', u.scam && '诈骗警告', u.fake && '冒充警告', u.deleted && '已注销'].filter(Boolean)
    : []

  return (
    <Sheet open={id != null && !!u} onClose={onClose}>
      {u && id != null && (
        <div className="px-4 pb-6">
          <div className="flex flex-col items-center pt-1 pb-5 text-center">
            <div className="rounded-full p-[3px] shadow-[0_10px_30px_rgb(0_0_0/0.14)] ring-1 ring-[var(--glass-edge)]">
              {u.avatar ? (
                <a href={dataUrl(u.avatar)} target="_blank" rel="noopener" aria-label="查看头像大图" className="block">
                  <Avatar id={id} name={u.name} src={u.avatar} size={96} />
                </a>
              ) : (
                <Avatar id={id} name={u.name} src={u.avatar} size={96} />
              )}
            </div>
            <div className="mt-3 flex max-w-full items-center gap-1.5">
              <span className="truncate text-[24px] leading-tight font-bold tracking-tight text-label">{u.name || '未知用户'}</span>
              {title && <TitleBadge {...title} className="" />}
            </div>
            {u.username && (
              <button type="button" data-press onClick={() => void copyText(`@${u.username}`, '用户名已复制')} className="mt-0.5 text-[15px] text-accent">
                @{u.username}
              </button>
            )}
            <div className="mt-1 text-[14px] text-label2">
              {[isChat ? '以群组身份发言的匿名管理员' : '', ...flags, u.count ? `${count(u.count)} 条消息` : ''].filter(Boolean).join(' · ')}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <ActionTile icon={MessageSquareText} label="消息" onClick={() => onSearch(id)} />
            <ActionTile icon={ChartColumn} label="趋势" disabled={!onStats} onClick={() => onStats?.(id)} />
            <ActionTile icon={Images} label="媒体" disabled={!onMedia} onClick={() => onMedia?.(id)} />
            {isChat ? <ActionTile icon={Info} label="群资料" onClick={onChatInfo} /> : <ActionTile icon={Send} label="Telegram" disabled={!tg} onClick={() => tg && openExternal(tg)} />}
          </div>

          {bio && (
            <Card className="mt-6 px-4 py-3">
              <div className="text-[13px] text-label2">{isChat ? '群简介' : '简介'}</div>
              <p className="mt-0.5 text-[16px] leading-snug break-words whitespace-pre-wrap">
                <Linkified text={bio} />
              </p>
            </Card>
          )}

          <Card className="mt-6">
            {u.username && (
              <Row leading={<IconBadge icon={AtSign} color="#007aff" />} label="用户名" value={`@${u.username}`} accent={false} chevron={false} onClick={() => void copyText(`@${u.username}`, '用户名已复制')} />
            )}
            <Row
              leading={<IconBadge icon={Hash} color="#8e8e93" />}
              label={`${isChat ? '群组' : '用户'} ID`}
              value={<span className="font-mono text-[15px]">{id}</span>}
              accent={false}
              chevron={false}
              onClick={() => void copyText(String(id), 'ID 已复制')}
            />
            {isChat && tg && <Row leading={<IconBadge icon={Send} color="#2aabee" />} label="在 Telegram 中打开" onClick={() => openExternal(tg)} />}
          </Card>
        </div>
      )}
    </Sheet>
  )
}
