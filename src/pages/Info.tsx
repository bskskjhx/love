import { useMemo, useState, type ReactNode } from 'react'
import { AtSign, BookOpen, CalendarRange, ChartColumn, Images, Link2, MessagesSquare, RefreshCw, Search, Send } from 'lucide-react'
import { useInView } from 'react-intersection-observer'
import { useDebounce } from 'use-debounce'
import { Avatar } from '../components/Avatar'
import { Share } from '../components/Icons'
import { NavBar, NavButton } from '../components/NavBar'
import { SearchField } from '../components/SearchField'
import { LoadState, Spinner } from '../components/States'
import { copyText } from '../components/Toast'
import { telegramLink } from '../lib/api'
import { openExternal, shareText } from '../lib/share'
import { count, fullDate, relative } from '../lib/format'
import { lastSearchPath } from '../lib/lastSearch'
import { goBack, navigate, paths } from '../lib/router'
import { ProfileSheet, profileLinks } from '../chat/ProfileSheet'
import { norm } from '../lib/scan'
import { activeMembers } from '../lib/text'
import { useDocumentTitle } from '../lib/theme'
import { useChat } from '../lib/useChat'
import { ActionTile, Card, IconBadge, MemberRow, Row, SectionHeader } from '../components/List'

const TYPE: Record<string, string> = { supergroup: '超级群组', group: '群组', channel: '频道', private: '私聊' }
const PAGE = 30
const ABOUT_FOLD = 160

export function InfoPage({ chatKey }: { chatKey: string }) {
  const { chat, error, retry } = useChat(chatKey)
  const [shown, setShown] = useState(PAGE)
  const [profile, setProfile] = useState<number | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [q, setQ] = useState('')
  const [needle] = useDebounce(norm(q.trim()), 150)
  const meta = chat?.meta
  const users = chat?.users
  useDocumentTitle(meta ? `${meta.title} · 群资料` : undefined)

  const members = useMemo(() => activeMembers(users ?? {}), [users])
  const matched = useMemo(
    () => (needle ? members.filter(([, u]) => norm(u.name).includes(needle) || (u.username && norm(u.username).includes(needle))) : members),
    [members, needle],
  )
  const { ref: more } = useInView({ rootMargin: '600px', skip: shown >= matched.length, onChange: (v) => v && setShown((n) => n + PAGE) })
  const link = meta && telegramLink(meta)

  return (
    <div className="relative h-full bg-grouped">
      <NavBar
        back={{ label: '返回', onClick: () => goBack(paths.chat(chatKey)) }}
        title={meta?.title ?? '群资料'}
        titleVisible={scrolled}
        transparentUntilScroll
        scrolled={scrolled}
        right={
          meta && (
            <NavButton label="分享" onClick={() => void shareText(meta.title, link ?? location.href, meta.title)}>
              <Share size={20} />
            </NavButton>
          )
        }
      />
      <div
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 150)}
        className="scroller absolute inset-0 pt-[calc(var(--safe-top)+var(--nav-h)+var(--player-h))] pb-[calc(var(--safe-bottom)+var(--kb)+24px)]"
      >
        {!chat && <LoadState error={error} retry={retry} />}
        {meta && (
          <div className="mx-auto max-w-2xl px-4">
            <div className="flex flex-col items-center pt-2 pb-5 text-center">
              <div className="rounded-full p-[3px] shadow-[0_10px_30px_rgb(0_0_0/0.14)] ring-1 ring-[var(--glass-edge)]">
                <Avatar id={meta.id} name={meta.title} src={meta.avatar} size={104} />
              </div>
              <h1 className="mt-3 max-w-full text-[26px] leading-tight font-bold tracking-tight break-words">{meta.title}</h1>
              <div className="mt-1 text-[15px] text-label2">
                {[meta.type && TYPE[meta.type], meta.members ? `${count(meta.members)} 位成员` : ''].filter(Boolean).join(' · ')}
              </div>
              {meta.username && (
                <button type="button" data-press onClick={() => void copyText(`@${meta.username}`, '用户名已复制')} className="mt-1 text-[15px] text-accent">
                  @{meta.username}
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              <ActionTile icon={Search} label="搜索" onClick={() => navigate(lastSearchPath(chatKey, meta.id))} />
              <ActionTile icon={Images} label="媒体" onClick={() => navigate(paths.media(chatKey))} />
              <ActionTile icon={ChartColumn} label="统计" onClick={() => navigate(paths.stats(chatKey))} />
              <ActionTile icon={BookOpen} label="从头读" disabled={!meta.firstId} onClick={() => meta.firstId && navigate(paths.chat(chatKey, meta.firstId))} />
            </div>

            {meta.about && <About text={meta.about} />}

            <SectionHeader>存档</SectionHeader>
            <Card>
              {meta.username && (
                <Row leading={<IconBadge icon={AtSign} color="#007aff" />} label="用户名" value={`@${meta.username}`} accent={false} chevron={false} onClick={() => void copyText(`@${meta.username}`, '用户名已复制')} />
              )}
              {link && <Row leading={<IconBadge icon={Link2} color="#5856d6" />} label="链接" value={link.replace(/^https:\/\//, '')} accent={false} chevron={false} onClick={() => void copyText(link, '链接已复制')} />}
              <Row leading={<IconBadge icon={MessagesSquare} color="#34c759" />} label="消息数" value={count(meta.count ?? 0)} />
              {meta.firstDate && meta.lastDate && (
                <Row leading={<IconBadge icon={CalendarRange} color="#ff9500" />} caption="时间范围">
                  {fullDate(meta.firstDate, false)} – {fullDate(meta.lastDate, false)}
                </Row>
              )}
              <Row leading={<IconBadge icon={RefreshCw} color="#8e8e93" />} label="存档更新" value={meta.updatedAt ? relative(meta.updatedAt) : '-'} />
            </Card>

            {link && (
              <Card className="mt-6">
                <Row leading={<IconBadge icon={Send} color="#2aabee" />} label="在 Telegram 中打开" onClick={() => openExternal(link)} />
              </Card>
            )}

            {members.length > 0 && (
              <>
                <SectionHeader>发言成员 {count(members.length)}</SectionHeader>
                {members.length > 8 && (
                  <div className="pb-2.5">
                    <SearchField value={q} onChange={setQ} placeholder="搜索成员" />
                  </div>
                )}
                {matched.length ? (
                  <Card>
                    {matched.slice(0, shown).map(([id, u]) => (
                      <MemberRow key={id} id={Number(id)} user={u} chatId={meta.id} onClick={() => setProfile(Number(id))} />
                    ))}
                  </Card>
                ) : (
                  <div className="py-8 text-center text-[15px] text-label2">没有匹配的成员</div>
                )}
                {shown < matched.length && (
                  <div ref={more} className="flex justify-center py-4">
                    <Spinner />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {meta && users && (
        <ProfileSheet
          id={profile}
          users={users}
          meta={meta}
          onClose={() => setProfile(null)}
          onChatInfo={() => setProfile(null)}
          {...profileLinks(chatKey, () => setProfile(null))}
        />
      )}
    </div>
  )
}

function About({ text }: { text: string }): ReactNode {
  const long = text.length > ABOUT_FOLD || text.split('\n').length > 5
  const [open, setOpen] = useState(false)
  return (
    <>
      <SectionHeader>简介</SectionHeader>
      <Card className="px-4 py-3">
        <p className={`text-[16px] leading-snug break-words whitespace-pre-wrap ${long && !open ? 'line-clamp-5' : ''}`}>{text}</p>
        {long && (
          <button type="button" data-press onClick={() => setOpen((o) => !o)} className="mt-1.5 text-[15px] text-accent">
            {open ? '收起' : '展开'}
          </button>
        )}
      </Card>
    </>
  )
}
