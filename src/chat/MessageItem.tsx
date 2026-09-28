import { memo, type CSSProperties, type ReactNode } from 'react'
import { useLongPress } from '../lib/longPress'
import { Avatar } from '../components/Avatar'
import { Comment, Eye } from '../components/Icons'
import { count, timeOf, fullDate } from '../lib/format'
import { PEER_COLORS, colorIndex, senderTitle, serviceText, userName, type SenderTitle } from '../lib/text'
import type { Message, Users } from '../lib/types'
import type { Item } from './grouping'
import { Album, MEDIA_MAX_W, MediaBody, Photo, WebPage, fitBox, isBare, isVisual } from './Media'
import { RichText } from './RichText'

export interface ItemHandlers {
  /** 跳转到消息；source 为发起跳转的消息，用于返回 */
  onJump: (id: number, source?: number) => void
  onOpenPhoto: (id: number) => void
  onHashtag: (tag: string) => void
  onContext: (msg: Message, el: HTMLElement) => void
  /** 点击头像或名字查看个人资料 */
  onProfile: (id: number) => void
  /** 打开某条消息的回复串 */
  onReplies?: (id: number) => void
}

interface Props extends ItemHandlers {
  item: Item
  chatId: number
  users: Users
  highlighted: boolean
  /** 回复数（含相册内各条） */
  replies?: number
}

function peerStyle(id: number | null | undefined): CSSProperties {
  const [a, b] = PEER_COLORS[colorIndex(id ?? 0)]
  return { '--pc-light': b, '--pc-dark': a } as CSSProperties
}
const PEER_TEXT = 'text-[var(--pc-light)] dark:text-[var(--pc-dark)]'
const PEER_BORDER = 'border-[var(--pc-light)] dark:border-[var(--pc-dark)]'

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

/** 只有 1–3 个表情的消息像官方一样放大显示、不带气泡；返回表情个数，否则 0 */
function jumboCount(m: Message): number {
  const text = m.text?.trim()
  if (!text || text.length > 40 || !segmenter || m.media || m.reply || m.fwd || m.ents?.length) return 0
  let n = 0
  for (const { segment } of segmenter.segment(text)) {
    if (/^\s+$/.test(segment)) continue
    if (!EMOJI_RE.test(segment) || ++n > 3) return 0
  }
  return n
}
const JUMBO_SIZE = [0, 72, 56, 46]

function MetaInfo({ m, overlay, hideSig }: { m: Message; overlay?: boolean; hideSig?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] leading-none whitespace-nowrap ${overlay ? 'rounded-full bg-black/45 px-1.5 py-[3px] text-white' : 'text-label2'}`}
      title={fullDate(m.date) + (m.edit ? `（编辑于 ${fullDate(m.edit)}）` : '')}
    >
      {m.views != null && (
        <>
          <Eye size={12} />
          {count(m.views)}
        </>
      )}
      {m.sig && !hideSig && <span className="max-w-24 truncate">{m.sig}</span>}
      {m.edit && <span>已编辑</span>}
      <span>{timeOf(m.date)}</span>
    </span>
  )
}

/** 名字右侧的头衔胶囊（与新版 Telegram 一致） */
export function TitleBadge({ text, owner, className = 'ml-auto' }: SenderTitle & { className?: string }) {
  const color = owner
    ? 'bg-[#a86bdc]/14 text-[#a064d6] dark:bg-[#bf5af2]/20 dark:text-[#d9a3f5]'
    : 'bg-[#5fb04a]/14 text-[#4f9e3c] dark:bg-[#30d158]/20 dark:text-[#7ee095]'
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-px text-[12.5px] leading-[16px] font-normal ${color} ${className}`}>
      {text}
    </span>
  )
}

function ReplyQuote({ m, users, onJump }: { m: Message; users: Users; onJump: ItemHandlers['onJump'] }) {
  const r = m.reply!
  if (r.ext) return <div className="mb-1 text-[13px] text-label2">回复其他会话的消息</div>
  return (
    <button
      type="button"
      data-press
      style={peerStyle(r.from)}
      onClick={(e) => {
        e.stopPropagation()
        onJump(r.id, m.id)
      }}
      className={`mb-1 block w-full min-w-0 rounded-[6px] border-l-[3px] bg-fill py-[3px] pr-2 pl-2 text-left text-[14px] leading-snug press-in ${PEER_BORDER}`}
    >
      <div className={`truncate font-semibold ${PEER_TEXT}`}>{r.from != null ? userName(users, r.from) : '消息'}</div>
      <div className="line-clamp-1 break-all text-label">{r.quote || r.text || '（原消息未存档）'}</div>
    </button>
  )
}

/** “N 条回复”（同官方回复/评论入口），点按打开回复串 */
function RepliesLink({ n, m, onReplies, hideSig }: { n?: number; m: Message; onReplies?: (id: number) => void; hideSig?: boolean }) {
  if (!n || !onReplies) return null
  const id = m.id
  return (
    <div className="flex items-end justify-between">
      <button
        type="button"
        data-press
        onClick={(e) => {
          e.stopPropagation()
          onReplies(id)
        }}
        className="mt-1 flex items-center gap-1 text-[13px] font-medium text-accent"
      >
        <Comment size={15} />
        {n} 条回复
      </button>
      {/* 给右下角的时间让出位置 */}
      <span className="invisible ml-3 text-[11px] leading-none" aria-hidden>
        <MetaInfo m={m} hideSig={hideSig} />
      </span>
    </div>
  )
}

function Reactions({ m }: { m: Message }) {
  if (!m.reacts?.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {m.reacts.map(([e, n]) => (
        <span key={e} className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-[2px] text-[13px] text-accent">
          <span>{e}</span>
          <span className="font-medium">{n}</span>
        </span>
      ))}
    </div>
  )
}

const ServiceItem = memo(function ServiceItem({ m, users, onJump, highlighted }: { m: Message; users: Users; onJump: ItemHandlers['onJump']; highlighted: boolean }) {
  const text = serviceText(m.svc!, userName(users, m.from), users, m.reply?.text)
  const clickable = m.svc!.type === 'pin' && m.reply
  return (
    <div data-mid={m.id} data-date={m.date} className={`flex justify-center px-6 py-1 ${highlighted ? 'jump-hl' : ''}`}>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => clickable && onJump(m.reply!.id, m.id)}
        className="jump-target glass-lite max-w-full rounded-full px-3 py-1 text-center text-[13px] leading-snug font-medium text-label"
      >
        {text}
      </button>
    </div>
  )
})

/** 每次分组都会生成新的 item 对象，按内容比较，避免加载更多时整列表重渲染 */
function sameItem(a: Item, b: Item): boolean {
  if (a === b) return true
  if (a.kind === 'svc' || b.kind === 'svc') return a.kind === 'svc' && b.kind === 'svc' && a.msg === b.msg
  if (a.first !== b.first || a.last !== b.last || a.msgs.length !== b.msgs.length) return false
  return a.msgs.every((m, i) => m === b.msgs[i])
}

export const MessageItem = memo(
  function MessageItem(props: Props) {
    const { item } = props
    if (item.kind === 'svc') return <ServiceItem m={item.msg} users={props.users} onJump={props.onJump} highlighted={props.highlighted} />
    return <Bubble {...props} item={item} />
  },
  (a, b) =>
    sameItem(a.item, b.item) &&
    a.highlighted === b.highlighted &&
    a.replies === b.replies &&
    a.onReplies === b.onReplies &&
    a.users === b.users &&
    a.chatId === b.chatId &&
    a.onJump === b.onJump &&
    a.onOpenPhoto === b.onOpenPhoto &&
    a.onHashtag === b.onHashtag &&
    a.onContext === b.onContext &&
    a.onProfile === b.onProfile,
)

function Bubble({ item, users, chatId, highlighted, replies, onJump, onOpenPhoto, onHashtag, onContext, onProfile, onReplies }: Props & { item: Extract<Item, { kind: 'msg' }> }) {
  const { msgs, first, last } = item
  const m = msgs[0]
  // 相册的文字可能在任意一条上
  const textMsg = msgs.find((x) => x.text) ?? m
  const user = m.from != null ? users[String(m.from)] : undefined
  const name = m.from != null ? userName(users, m.from) : ''
  const album = msgs.length > 1
  const media = m.media
  const visual = album || isVisual(media)
  const jumbo = album ? 0 : jumboCount(m)
  const bare = jumbo > 0 || (!album && isBare(media) && !textMsg.text && !m.reply && !m.fwd)
  const hasText = !!textMsg.text
  const press = useLongPress((el) => onContext(textMsg, el))
  const title = senderTitle(m, users, chatId)
  const anon = m.from === chatId

  const header: ReactNode[] = []
  if (first && !bare) {
    header.push(
      <div key="n" style={peerStyle(m.from)} className="mb-[3px] flex min-h-[18px] items-center gap-4 text-[14px] leading-tight">
        <span className={`min-w-0 truncate font-semibold ${PEER_TEXT}`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (m.from != null) onProfile(m.from)
            }}
            data-press
            className="hit-sm font-semibold"
          >
            {name}
          </button>
          {user?.bot && <span className="ml-1 text-[11px] font-normal text-label2">机器人</span>}
          {m.via && <span className="ml-1 font-normal text-label2">通过 @{m.via}</span>}
        </span>
        {title && <TitleBadge {...title} />}
      </div>,
    )
  }
  if (m.fwd) {
    header.push(
      <div key="f" className="text-[13px] leading-snug text-accent">
        转发自 <span className="font-semibold">{m.fwd.name}</span>
      </div>,
    )
  }
  if (m.reply) header.push(<ReplyQuote key="r" m={m} users={users} onJump={onJump} />)

  let body: ReactNode
  if (album) body = <Album msgs={msgs} onOpen={onOpenPhoto} />
  else if (media?.type === 'photo') body = <Photo msg={m} onOpen={onOpenPhoto} />
  else if (media && media.type !== 'webpage') body = <MediaBody msg={m} chatId={chatId} name={name} />

  const text = hasText && (
    <div className="bubble-text flow-root">
      <RichText text={textMsg.text!} ents={textMsg.ents} onHashtag={onHashtag} />
      {/* 给右下角时间占位：用右浮动而不是行内块。末行放得下时和文字同行；放不下时只另起一个时间高度，
          而不是一整行文字的行高，气泡底部不会空出一大块 */}
      <span className="invisible float-right mt-1 ml-2 text-[11px] leading-none" aria-hidden>
        <MetaInfo m={textMsg} hideSig={anon} />
      </span>
    </div>
  )

  const avatarCol = (
    <div className="w-9 shrink-0 self-end">
      {last && m.from != null && (
        <button type="button" onClick={() => onProfile(m.from!)} aria-label={`查看 ${name} 的资料`} data-press className="block rounded-full">
          <Avatar id={m.from} name={name} src={user?.avatar} size={36} />
        </button>
      )}
    </div>
  )

  if (bare) {
    return (
      <div data-mid={m.id} data-date={m.date} className={`flex items-end gap-1.5 px-2 ${first ? 'pt-1.5' : 'pt-0.5'} ${highlighted ? 'jump-hl' : ''}`}>
        {avatarCol}
        <div className="jump-target no-touch-select relative" {...press}>
          {jumbo ? (
            <div
              className="pb-5 leading-[1.15]"
              style={{
                fontSize: `calc(${JUMBO_SIZE[jumbo]}px * var(--msg-scale, 1))`,
              }}
            >
              {m.text!.trim()}
            </div>
          ) : (
            <MediaBody msg={m} chatId={chatId} name={name} />
          )}
          <div className="absolute right-0 bottom-0">
            <MetaInfo m={m} overlay hideSig={anon} />
          </div>
          <Reactions m={m} />
          <RepliesLink n={replies} m={textMsg} onReplies={onReplies} hideSig={anon} />
        </div>
      </div>
    )
  }

  const radius = `rounded-[20px] ${last ? 'rounded-bl-[6px]' : ''}`
  return (
    <div data-mid={m.id} data-date={m.date} className={`flex items-end gap-1.5 px-2 ${first ? 'pt-1.5' : 'pt-0.5'} ${highlighted ? 'jump-hl' : ''}`}>
      {avatarCol}
      <div
        {...press}
        className={`jump-target no-touch-select relative min-w-[64px] bg-bubble shadow-[0_1px_1px_rgba(0,0,0,0.12)] ${radius} ${visual ? 'overflow-hidden' : 'max-w-[min(82%,520px)] px-2.5 pt-1.5 pb-1.5'}`}
        style={
          visual
            ? {
                width: `min(${album ? MEDIA_MAX_W : fitBox(media?.w || 16, media?.h || 9).w}px, 68vw)`,
              }
            : undefined
        }
      >
        {visual ? (
          <>
            {header.length > 0 && <div className="px-2.5 pt-1.5 pb-1">{header}</div>}
            {body}
            {(hasText || m.reacts || !!replies) && (
              <div className="px-2.5 pt-1 pb-1.5">
                {text}
                <Reactions m={m} />
                <RepliesLink n={replies} m={textMsg} onReplies={onReplies} hideSig={anon} />
              </div>
            )}
            <div className="absolute right-2 bottom-1.5">
              <MetaInfo m={textMsg} overlay={!hasText && !m.reacts && !replies} hideSig={anon} />
            </div>
          </>
        ) : (
          <>
            {header}
            {body}
            {text}
            {media?.type === 'webpage' && <WebPage media={media} />}
            <Reactions m={m} />
            <RepliesLink n={replies} m={textMsg} onReplies={onReplies} hideSig={anon} />
            {!hasText && <div className="h-3" />}
            <div className="absolute right-2.5 bottom-1.5">
              <MetaInfo m={textMsg} hideSig={anon} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
