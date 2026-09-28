import {
  Archive as LArchive,
  ArrowRight as LArrowRight,
  Calendar as LCalendar,
  ChevronDown as LChevronDown,
  ChevronLeft as LChevronLeft,
  ChevronRight as LChevronRight,
  Circle as LCircle,
  CircleCheck,
  CircleX,
  Copy as LCopy,
  Download as LDownload,
  ExternalLink,
  Eye as LEye,
  File,
  Hash as LHash,
  Link as LLink,
  List,
  Lock as LLock,
  MapPin,
  MessageCircle,
  Music as LMusic,
  Pause as LPause,
  Pin as LPin,
  Play as LPlay,
  Reply as LReply,
  Search as LSearch,
  Settings,
  Share as LShare,
  User,
  Users as LUsers,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'

/**
 * 图标统一来自 lucide-react。这里只按项目原来的名字导出，并保留各处的默认尺寸与线宽，
 * 调用方式不变：<Search size={18} />。
 */
type P = Omit<LucideProps, 'ref'>

const icon = (Icon: LucideIcon, size: number, strokeWidth = 2, extra = '') =>
  function AppIcon({ size: s, className = '', ...p }: P) {
    return <Icon size={s ?? size} strokeWidth={strokeWidth} aria-hidden className={`${extra} ${className}`.trim() || undefined} {...p} />
  }

export const ChevronLeft = icon(LChevronLeft, 24, 2.6)
export const ChevronRight = icon(LChevronRight, 16, 2.4)
export const ChevronDown = icon(LChevronDown, 22, 2.4)
export const Search = icon(LSearch, 22)
export const Calendar = icon(LCalendar, 22)
export const Gear = icon(Settings, 22)
export const Close = icon(X, 22, 2.2)
/** 实心圆 + 镂空的叉（输入框清除按钮） */
export const XCircle = icon(CircleX, 22, 2, 'fill-current [&>path]:stroke-[var(--cell)]')
export const Play = icon(LPlay, 22, 2, 'fill-current')
export const Pause = icon(LPause, 22, 2, 'fill-current')
export const FileIcon = icon(File, 22)
export const Download = icon(LDownload, 22)
export const Link = icon(LLink, 22)
/** 位置 */
export const Pin = icon(MapPin, 22)
export const Eye = icon(LEye, 22)
export const Music = icon(LMusic, 22)
export const Users = icon(LUsers, 22)
export const Archive = icon(LArchive, 22)
export const Share = icon(LShare, 22)
export const Copy = icon(LCopy, 22)
export const Reply = icon(LReply, 22)
export const Person = icon(User, 22)
export const External = icon(ExternalLink, 22)
/** 置顶图钉 */
export const Pushpin = icon(LPin, 22)
export const ListIcon = icon(List, 22)
/** 实心圆 + 白色对勾（多选已选中） */
export const CheckCircle = icon(CircleCheck, 22, 2, 'fill-current [&>path]:stroke-white')
export const Circle = icon(LCircle, 22, 1.6)
export const Comment = icon(MessageCircle, 22)
export const Hash = icon(LHash, 22)
export const Lock = icon(LLock, 22)
export const ArrowRight = icon(LArrowRight, 22, 2.4)
