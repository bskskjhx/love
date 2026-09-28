import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { TitleBadge } from '../chat/MessageItem'
import { count } from '../lib/format'
import { memberTitle } from '../lib/text'
import type { User } from '../lib/types'
import { Avatar } from './Avatar'
import { ChevronRight } from './Icons'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-[var(--r-card)] bg-cell ${className}`}>{children}</div>
}

export function SectionHeader({ children, first }: { children: ReactNode; first?: boolean }) {
  return <div className={`px-4 ${first ? 'pt-3' : 'pt-6'} pb-1.5 text-[13px] text-label2 uppercase`}>{children}</div>
}

interface RowProps {
  label?: ReactNode
  caption?: ReactNode
  value?: ReactNode
  right?: ReactNode
  leading?: ReactNode
  onClick?: () => void
  accent?: boolean
  chevron?: boolean
  children?: ReactNode
}

export function Row({ label, caption, value, right, leading, onClick, accent, chevron, children }: RowProps) {
  const Tag = onClick ? 'button' : 'div'
  const plain = caption == null
  const showChevron = chevron ?? (!!onClick && plain && !right)
  return (
    <Tag
      onClick={onClick}
      data-press={onClick ? true : undefined}
      className={`list-row flex w-full items-center gap-3 pl-4 text-left ${onClick ? 'press-row' : ''}`}
    >
      {leading}
      <div className="list-line flex min-h-[52px] min-w-0 flex-1 items-center gap-2 py-2 pr-4">
        {plain ? (
          <div className={`min-w-0 flex-1 text-[17px] ${(accent ?? !!onClick) ? 'text-accent' : ''}`}>{label}</div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-label2">{caption}</div>
            <div className="mt-0.5 text-[16px] leading-snug break-words text-label">{children}</div>
          </div>
        )}
        {value != null && value !== '' && <span className="shrink-0 text-[17px] text-label2">{value}</span>}
        {right}
        {showChevron && <ChevronRight className="shrink-0 text-label3" />}
      </div>
    </Tag>
  )
}

export function MemberRow({ id, user, chatId, onClick, selected }: { id: number; user: User; chatId: number; onClick: () => void; selected?: boolean }) {
  const title = memberTitle(user, id === chatId)
  return (
    <Row
      onClick={onClick}
      accent={false}
      chevron={false}
      leading={<Avatar id={id} name={user.name} src={user.avatar} size={36} />}
      label={
        <>
          <div className="flex items-center gap-1.5 text-[16px] text-label">
            <span className="truncate">{user.name}</span>
            {user.bot && <span className="shrink-0 text-[12px] text-label2">机器人</span>}
            {title && <TitleBadge {...title} className="" />}
          </div>
          {user.username && <div className="truncate text-[13px] text-label2">@{user.username}</div>}
        </>
      }
      right={
        <>
          {user.count ? <span className="shrink-0 text-[14px] text-label2">{count(user.count)} 条</span> : null}
          {selected && <span className="shrink-0 text-[17px] text-accent">✓</span>}
        </>
      }
    />
  )
}

export function ActionTile({ icon: Icon, label, onClick, disabled }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      data-press
      disabled={disabled}
      onClick={onClick}
      className="flex h-[64px] flex-col items-center justify-center gap-1 rounded-[18px] bg-cell text-accent disabled:opacity-40"
      style={{ '--press': 1.06 } as React.CSSProperties}
    >
      <Icon size={22} strokeWidth={2.2} aria-hidden />
      <span className="text-[12px] font-medium">{label}</span>
    </button>
  )
}

export function IconBadge({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] text-white" style={{ background: color }}>
      <Icon size={18} strokeWidth={2.3} aria-hidden />
    </span>
  )
}
